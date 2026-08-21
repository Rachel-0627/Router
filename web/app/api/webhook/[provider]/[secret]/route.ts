/**
 * 支付回调入口:POST /api/webhook/<provider>/<secret>
 *
 * 为什么把 secret 放在路径里:
 *   NexaPay 这类通道不提供签名验证,回调地址一旦被猜到就能被伪造。
 *   路径里加一段随机串,相当于给回调地址上了一把锁。
 *   但这只是第一道门 —— 真正的保障是 settlePayment() 里的回查校验。
 *
 * 返回码语义(决定支付商会不会重试):
 *   200  已处理(含「早就处理过了」)→ 不要重试
 *   401  secret 不对 → 不要重试
 *   400  读不出订单号 → 不要重试
 *   500  临时故障 → 请重试
 */
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { getProvider } from '@/lib/payment'
import { settlePayment } from '@/lib/credits'
import { logger } from '@/lib/logger'
import { toAppError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string; secret: string }> },
) {
  const { provider: providerName, secret } = await ctx.params

  // 第一道门:路径 secret
  const expected = env.PAYMENT_WEBHOOK_PATH_SECRET
  if (!expected || secret !== expected) {
    logger.warn('webhook secret 不匹配,已拒绝', { provider: providerName })
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let provider
  try {
    provider = getProvider(providerName)
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  // 只解析订单号,body 里其他字段一律不采信
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 })
  }

  const externalId = provider.parseWebhookExternalId(body, req.headers)
  if (!externalId) {
    logger.warn('webhook 里读不出订单号', { provider: providerName })
    return NextResponse.json({ ok: false, reason: 'no_order_id' }, { status: 400 })
  }

  try {
    // 这里面会回查支付商确认真实状态和金额
    const result = await settlePayment(externalId, providerName)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const err = toAppError(e)
    logger.error('webhook 处理失败', { provider: providerName, externalId, code: err.code, detail: err.detail })
    // 4xx 是我们判定的确定性拒绝,不该重试;其余按临时故障让对方重试
    const retryable = err.httpStatus >= 500
    return NextResponse.json({ ok: false, code: err.code }, { status: retryable ? 500 : err.httpStatus })
  }
}
