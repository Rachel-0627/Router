'use server'
/**
 * 回调防线演练 —— 不花一分钱,把 webhook 的四道门逐一打穿试试。
 *
 * 为什么值得做:真实付款那一环暂时验不了(要先有 USDT),但**被伪造回调
 * 骗走额度**这个风险和真实付款无关 —— 它随时可能发生,而且一旦发生
 * 就是白送额度。这个演练验的正是那道防线。
 *
 * 四发测试,每发打穿一层:
 *   ① 路径密钥错     → 应 401(挡住猜地址的)
 *   ② 签名错         → 应 401(挡住没有 IPN 密钥的)
 *   ③ 签名对但订单不存在 → 应 4xx(挡住凭空捏造订单号的)
 *   ④ 签名对+订单真实,但上游说没付款 → **不入账**(最关键的一道)
 *
 * ④ 才是重点:就算攻击者偷到了 IPN 密钥、能伪造出合法签名、还知道
 * 真实订单号,**依然骗不到额度** —— 因为我们永远回查支付商。
 */
import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orders, creditLedger } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { getSecret } from '@/lib/secrets/store'
import { getBalanceMicroUsd } from '@/lib/credits'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { Check } from './ops-payment-test'

export type WebhookTestState = { ok: boolean; message: string; checks?: Check[] } | undefined

const sortedJson = (o: Record<string, unknown>) => JSON.stringify(o, Object.keys(o).sort())

export async function testWebhookDefenses(): Promise<WebhookTestState> {
  const [user, admin] = await Promise.all([getCurrentUser(), hasOpsAccess()])
  if (!user || !admin) return { ok: false, message: '需要管理员权限' }

  const ipnSecret = await getSecret('NOWPAYMENTS_IPN_SECRET')
  const pathSecret = env.PAYMENT_WEBHOOK_PATH_SECRET
  if (!ipnSecret) return { ok: false, message: '还没填 IPN 密钥,没法构造合法签名。' }
  if (!pathSecret) return { ok: false, message: '缺 PAYMENT_WEBHOOK_PATH_SECRET。' }

  const base = env.APP_URL.replace(/\/$/, '')
  const url = `${base}/api/webhook/nowpayments/${pathSecret}`
  const checks: Check[] = []

  // 造一个真实存在的待支付订单,用来测第 ④ 道门
  const fakeInvoiceId = `wtest_${Date.now()}`
  const fakePaymentId = '999999999999' // 上游查不到的 payment_id
  const before = await getBalanceMicroUsd(user.id)
  let orderId = ''

  const post = async (target: string, body: Record<string, unknown>, sig: string) => {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nowpayments-sig': sig },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    return { status: r.status, text: (await r.text()).slice(0, 200) }
  }

  try {
    const payload = {
      payment_status: 'finished',
      invoice_id: fakeInvoiceId,
      payment_id: fakePaymentId,
      price_amount: 500,
      price_currency: 'usd',
      actually_paid_at_fiat: 500,
      order_id: 'forged',
    }
    const goodSig = createHmac('sha512', ipnSecret).update(sortedJson(payload), 'utf8').digest('hex')

    // ① 路径密钥错
    const r1 = await post(`${base}/api/webhook/nowpayments/deadbeef`, payload, goodSig)
    checks.push({
      name: '① 猜错回调地址',
      ok: r1.status === 401,
      detail: `HTTP ${r1.status}${r1.status === 401 ? '(已挡下)' : ' ⚠️ 应该是 401'}`,
    })

    // ② 签名错
    const r2 = await post(url, payload, 'f'.repeat(128))
    checks.push({
      name: '② 地址对但签名错',
      ok: r2.status === 401,
      detail: `HTTP ${r2.status}${r2.status === 401 ? '(已挡下)' : ' ⚠️ 应该是 401'}`,
    })

    // ③ 签名对,但订单号是编的
    const r3 = await post(url, payload, goodSig)
    checks.push({
      name: '③ 签名合法但订单号是编的',
      ok: r3.status >= 400 && r3.status < 500,
      detail: `HTTP ${r3.status} ${r3.text}${r3.status >= 400 && r3.status < 500 ? '(已挡下)' : ' ⚠️ 不该放行'}`,
    })

    // ④ 最关键:订单真实存在 + 签名合法,但上游查无此付款
    const [row] = await db
      .insert(orders)
      .values({
        userId: user.id,
        provider: 'nowpayments',
        externalId: fakeInvoiceId,
        amountCents: 500,
        creditsMicroUsd: 5_000_000,
        status: 'pending',
      })
      .returning()
    orderId = row.id

    const r4 = await post(url, payload, goodSig)
    const after = await getBalanceMicroUsd(user.id)
    const credited = after - before
    const [fresh] = await db.select().from(orders).where(eq(orders.id, orderId))

    checks.push({
      name: '④ 订单真实 + 签名合法,但上游查无此付款',
      ok: credited === 0 && fresh?.status !== 'paid',
      detail:
        credited === 0
          ? `额度纹丝不动(余额 $${(after / 1e6).toFixed(2)}),订单仍是 ${fresh?.status} —— 回查防线生效`
          : `⚠️ 竟然加了 $${(credited / 1e6).toFixed(2)} 额度!回查防线失效,这是严重漏洞`,
    })

    const allOk = checks.every((c) => c.ok)
    logger.info('回调防线演练完成', { allOk, credited })
    return {
      ok: allOk,
      message: allOk
        ? '四道门全部守住。就算攻击者偷到 IPN 密钥、伪造出合法签名、还知道真实订单号,也骗不到额度 —— 因为我们永远回查支付商。'
        : '有防线没守住,见下方。这是要立刻修的。',
      checks,
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    logger.error('回调防线演练失败', { detail })
    return { ok: false, message: `演练中断:${detail}`, checks }
  } finally {
    // 不论成败都清掉测试数据,别在真实订单表里留垃圾
    if (orderId) {
      await db.delete(creditLedger).where(eq(creditLedger.refId, orderId)).catch(() => {})
      await db.delete(orders).where(eq(orders.id, orderId)).catch(() => {})
    }
  }
}
