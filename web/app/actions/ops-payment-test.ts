'use server'
/**
 * 支付通道自检 —— 真实调一次 NOWPayments,确认接口对接无误。
 *
 * 为什么必须做成服务端 action:API key 加密存在库里,钥匙只在 Vercel 环境变量,
 * 本地拿不到明文。只有跑在服务器上才能用这把 key。
 *
 * 五项检查,从浅到深。**不花钱** —— 建的 invoice 没人付就是一张废单。
 */
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { getSecret } from '@/lib/secrets/store'
import { env } from '@/lib/env'
import { site } from '@/lib/site'
import { logger } from '@/lib/logger'

export type Check = { name: string; ok: boolean; detail: string }
export type PayTestState = { ok: boolean; message: string; checks?: Check[] } | undefined

const B = 'https://api.nowpayments.io/v1'

export async function testPaymentChannel(): Promise<PayTestState> {
  const [user, admin] = await Promise.all([getCurrentUser(), hasOpsAccess()])
  if (!user || !admin) return { ok: false, message: '需要管理员权限' }

  const key = await getSecret('NOWPAYMENTS_API_KEY')
  const ipn = await getSecret('NOWPAYMENTS_IPN_SECRET')
  const checks: Check[] = []

  if (!key) return { ok: false, message: '还没填 NOWPayments API Key。' }
  const h = { 'x-api-key': key, 'Content-Type': 'application/json' }
  const get = async (p: string) => {
    const r = await fetch(`${B}${p}`, { headers: h, signal: AbortSignal.timeout(20_000) })
    return { status: r.status, text: (await r.text()).slice(0, 300) }
  }

  try {
    // ① 服务在不在
    const s = await get('/status')
    checks.push({ name: '① NOWPayments 服务状态', ok: s.status === 200, detail: s.text })

    // ② key 有没有效 —— 401 就是 key 不对
    const b = await get('/balance')
    checks.push({
      name: '② API Key 是否有效',
      ok: b.status === 200,
      detail: b.status === 401 ? 'HTTP 401 —— key 不对,或填成了 Public key' : `HTTP ${b.status} ${b.text}`,
    })
    if (b.status !== 200) {
      return { ok: false, message: 'API Key 无效,后面的检查没必要做了。', checks }
    }

    // ③ 最低充值额 —— 我们定了 $5,得确认上游支持
    const m = await get(`/min-amount?currency_from=usd&currency_to=usdttrc20`)
    let minOk = m.status === 200
    let minNote = m.text
    try {
      const j = JSON.parse(m.text) as { min_amount?: number }
      if (typeof j.min_amount === 'number') {
        minOk = j.min_amount <= site.minTopupUsd
        minNote = `上游最低 ${j.min_amount} USD · 我们设的最低 ${site.minTopupUsd} USD${minOk ? '' : ' ⚠️ 我们设得太低了,要调高'}`
      }
    } catch {
      /* 保持原始返回 */
    }
    checks.push({ name: '③ 最低充值额是否兼容', ok: minOk, detail: minNote })

    // ④ 真实建一张 invoice —— 最关键的一步
    const secret = env.PAYMENT_WEBHOOK_PATH_SECRET
    const appUrl = env.APP_URL.replace(/\/$/, '')
    const body = {
      price_amount: String(site.minTopupUsd.toFixed(2)),
      price_currency: 'usd',
      order_id: `selftest_${Date.now()}`,
      order_description: `${env.APP_NAME} credits`,
      pay_currency: 'usdttrc20',
      is_fixed_rate: true,
      is_fee_paid_by_user: true,
      success_url: `${appUrl}/dashboard/billing`,
      cancel_url: `${appUrl}/dashboard/billing`,
      ...(secret ? { ipn_callback_url: `${appUrl}/api/webhook/nowpayments/${secret}` } : {}),
    }
    const r = await fetch(`${B}/invoice`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const txt = await r.text()
    if (!r.ok) {
      checks.push({ name: '④ 创建收款单', ok: false, detail: `HTTP ${r.status} ${txt.slice(0, 250)}` })
      return { ok: false, message: '建单失败,见下方详情。', checks }
    }
    const inv = JSON.parse(txt) as { id?: unknown; invoice_url?: unknown }
    const id = String(inv.id ?? '')
    const url = String(inv.invoice_url ?? '')
    checks.push({
      name: '④ 创建收款单',
      ok: Boolean(id && url),
      detail: id && url ? `id=${id} · 收款页 ${url}` : `返回缺字段: ${txt.slice(0, 200)}`,
    })

    // ⑤ 按 invoice 回查 —— 我们入账前走的就是这条
    const q = await get(`/payment/?invoiceid=${encodeURIComponent(id)}&limit=5`)
    let qOk = q.status === 200
    let qNote = q.text
    try {
      const j = JSON.parse(q.text) as { data?: unknown[] }
      qNote = `HTTP 200 · data ${Array.isArray(j.data) ? j.data.length : '?'} 条(还没人付款,0 条是正常的)`
      qOk = Array.isArray(j.data)
    } catch {
      /* 保持原始返回 */
    }
    checks.push({ name: '⑤ 按收款单回查(入账前的校验路径)', ok: qOk, detail: qNote })

    checks.push({
      name: '⑥ IPN 验签密钥',
      ok: Boolean(ipn),
      detail: ipn ? '已配置 —— 回调会验签' : '⚠️ 没填,回调将一律被拒',
    })

    const allOk = checks.every((c) => c.ok)
    logger.info('支付通道自检完成', { allOk, invoiceId: id })
    return {
      ok: allOk,
      message: allOk
        ? `全部通过。收款单能建、能回查、验签密钥在位 —— 对接没问题,就差一笔真实付款了。`
        : '有项目没通过,见下方。',
      checks,
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error('支付通道自检失败', { detail })
    return { ok: false, message: `自检中断:${detail}`, checks }
  }
}
