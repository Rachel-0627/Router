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

    // ② key 有没有效
    //
    // ⚠️ 这一项失败**不要提前退出**。NOWPayments 的 IP 白名单只限制
    //    「提现类」端点,/balance 属于其中,但建收款单未必受限 ——
    //    真正要紧的是建单能不能跑通。卡在这就返回,会让人误以为整条路不通,
    //    进而去关掉一个本来该留着的安全设置。
    const b = await get('/balance')
    const ipBlocked = b.status === 403 && b.text.includes('Invalid IP')
    checks.push({
      name: '② API Key 是否有效',
      ok: b.status === 200,
      detail:
        b.status === 401
          ? 'HTTP 401 —— key 不对,或填成了 Public key'
          : ipBlocked
            ? `被 IP 白名单挡住(${b.text.match(/Invalid IP - ([\d.]+)/)?.[1] ?? '未知 IP'})。这只说明「查余额/提现」受限,不代表建单不行 —— 看第 ④ 项`
            : `HTTP ${b.status} ${b.text}`,
    })
    if (b.status === 401) {
      return { ok: false, message: 'API Key 无效(401),后面的检查没必要做了。', checks }
    }

    // ③ 最低充值额。
    //
    // ⚠️ 这个下限受两个开关影响,不是一个固定数:
    //      is_fixed_rate      锁汇率,通常会**抬高**最低额
    //      is_fee_paid_by_user 网络费谁出
    //    所以要把组合都探一遍,才知道能压到多低、代价是什么。
    const combos = [
      { label: '锁汇率+用户付网络费(当前设置)', q: 'is_fixed_rate=true&is_fee_paid_by_user=true' },
      { label: '锁汇率+我们付网络费', q: 'is_fixed_rate=true&is_fee_paid_by_user=false' },
      { label: '不锁汇率+用户付网络费', q: 'is_fixed_rate=false&is_fee_paid_by_user=true' },
      { label: '不锁汇率+我们付网络费', q: 'is_fixed_rate=false&is_fee_paid_by_user=false' },
    ]
    const mins: string[] = []
    let lowest = Number.POSITIVE_INFINITY
    for (const c of combos) {
      const r = await get(`/min-amount?currency_from=usd&currency_to=usdttrc20&${c.q}`)
      let v = '?'
      try {
        const j = JSON.parse(r.text) as { min_amount?: number }
        if (typeof j.min_amount === 'number') {
          v = `$${j.min_amount.toFixed(2)}`
          if (j.min_amount < lowest) lowest = j.min_amount
        } else v = r.text.slice(0, 60)
      } catch {
        v = `HTTP ${r.status}`
      }
      mins.push(`${c.label} → ${v}`)
    }
    const minOk = Number.isFinite(lowest) && lowest <= site.minTopupUsd
    checks.push({
      name: '③ 最低充值额(各组合实测)',
      ok: minOk,
      detail:
        mins.join('  ◆  ') +
        `\n\n我们设的最低 $${site.minTopupUsd}` +
        (Number.isFinite(lowest) ? ` · 上游能压到的最低 $${lowest.toFixed(2)}` : '') +
        (minOk ? '' : ' ⚠️ 我们设得太低,用户付款时会被拒'),
    })

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
    // ⑤ 回查路径。
    //
    // ⚠️ 实测按 invoice 查的四个端点全不通(/invoice/{id} 404、
    //    /payment/?invoiceId= 401 要 JWT、/payment/?invoiceid= 401、
    //    /invoice-payment/ 404)。列表接口要拿账号密码换 JWT ——
    //    存登录密码比存 API key 危险得多,不走那条路。
    //
    //    实际走 /payment/{payment_id},它只要 API key。payment_id 建单时
    //    还不存在,从**已验签的回调**里取。
    //
    //    这里用一个不存在的 id 探测:返回 **404 而不是 401**,
    //    就证明 API key 在这个端点上是有效的 —— 这正是我们要确认的事。
    const probe = await get('/payment/999999999999')
    const keyWorksHere = probe.status === 404 || probe.status === 200
    checks.push({
      name: '⑤ 回查路径 /payment/{payment_id}',
      ok: keyWorksHere,
      detail: keyWorksHere
        ? `HTTP ${probe.status}(用不存在的 id 探测,404 = 端点认我们的 key,路径可用)`
        : probe.status === 401
          ? 'HTTP 401 —— 这个端点也不认 API key,回查无路可走'
          : `HTTP ${probe.status} ${probe.text}`,
    })

    checks.push({
      name: '⑥ IPN 验签密钥',
      ok: Boolean(ipn),
      detail: ipn ? '已配置 —— 回调会验签' : '⚠️ 没填,回调将一律被拒',
    })

    const allOk = checks.every((c) => c.ok)
    // 只有第②项因 IP 白名单失败、其余都过 —— 这是**理想状态**,不是故障:
    // 收款照常工作,而提现仍受 IP 保护,别人偷了 key 也提不走钱。
    const onlyIpBlocked = !allOk && checks.every((c) => c.ok || c.name.startsWith('②'))
    logger.info('支付通道自检完成', { allOk, onlyIpBlocked, invoiceId: id })
    return {
      ok: allOk || onlyIpBlocked,
      message: allOk
        ? '全部通过。收款单能建、能回查、验签密钥在位 —— 对接没问题,就差一笔真实付款了。'
        : onlyIpBlocked
          ? '收款链路全通。只有「查余额」被 IP 白名单挡着 —— 这**不用修**:收款不受影响,而提现仍受 IP 保护,别人偷了 key 也提不走钱。建议保持现状。'
          : '有项目没通过,见下方。',
      checks,
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error('支付通道自检失败', { detail })
    return { ok: false, message: `自检中断:${detail}`, checks }
  }
}
