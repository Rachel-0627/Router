/**
 * 额度入账 —— 支付链路里最容易赔钱的一环,规则写死在这里。
 *
 * 三道防线:
 *   1. 回查校验   webhook 内容一律不信,金额和状态以支付商 API 回查结果为准
 *   2. 行级锁     入账时锁住订单行,并发重复回调只有一个能进
 *   3. 状态幂等   订单已是 paid 就直接返回,不重复加钱
 *
 * ⚠️ credit_ledger 只追加不修改。余额 = 流水求和,不存余额字段。
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db'
import { creditLedger, orders } from './db/schema'
import { getProvider } from './payment'
import { logger } from './logger'
import { conflict, badRequest, notFound } from './errors'

export type SettleResult =
  | { applied: true; userId: string; creditsMicroUsd: number }
  | { applied: false; reason: 'not_paid' | 'already_settled' }

/**
 * 结算一笔支付。webhook 和「用户手动点已支付」都走这里,重复调用安全。
 */
export async function settlePayment(
  externalId: string,
  providerName?: string,
): Promise<SettleResult> {
  const provider = getProvider(providerName)

  // ── 防线1:回查支付商,不信 webhook ──
  const verified = await provider.verifyPayment(externalId)
  if (verified.status !== 'paid') {
    logger.info('支付未完成,不入账', { provider: provider.name, externalId, status: verified.status })
    return { applied: false, reason: 'not_paid' }
  }

  return db.transaction(async (tx) => {
    // ── 防线2:锁住订单行,并发回调排队 ──
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.provider, provider.name), eq(orders.externalId, externalId)))
      .limit(1)
      .for('update')

    if (!order) {
      // 订单应该在发起支付时就已创建。查不到说明数据不一致,宁可不入账。
      logger.error('回调的订单在库里不存在,拒绝入账', { provider: provider.name, externalId })
      throw notFound({ provider: provider.name, externalId })
    }

    // ── 防线3:已结算过就直接返回 ──
    if (order.status === 'paid') {
      logger.info('订单已结算,跳过', { orderId: order.id })
      return { applied: false, reason: 'already_settled' as const }
    }
    if (order.status === 'refunded') {
      throw conflict('This order has already been refunded.', { orderId: order.id })
    }

    // ── 金额核对 ──
    //
    // ⚠️ 不能要求"实付必须等于订单金额"。加密货币充值里**少付是常态**:
    //    用户从交易所提币,平台会扣一笔提币手续费,想转 $20 实际到账可能
    //    只有 $18.9。按严格相等判,这笔钱就卡住了 —— 用户付了钱拿不到额度,
    //    而链上转账不可逆,他连退都退不回去。这是加密货币充值最大的客诉来源。
    //
    //    所以改成**到多少记多少**。我们不做任何赠送,额度和美元是 1:1,
    //    按实付入账天然正确,多付少付都不用特殊处理。
    //
    //    只保留一道防呆:实付远超订单(可能是我们自己算错或对方返回异常)时拒绝,
    //    宁可人工核对也不要凭一个可疑数字凭空发额度。
    if (verified.amountCents <= 0) {
      logger.error('回查金额为 0 或负数,拒绝入账', { orderId: order.id, verifiedCents: verified.amountCents })
      throw badRequest(undefined, { reason: 'amount_invalid', orderId: order.id })
    }
    if (verified.amountCents > order.amountCents * 2) {
      logger.error('回查金额远超订单,拒绝入账待人工核对', {
        orderId: order.id,
        expectedCents: order.amountCents,
        verifiedCents: verified.amountCents,
      })
      throw badRequest(undefined, { reason: 'amount_too_large', orderId: order.id })
    }
    // 实际入账额度 = 实付金额(美分 → micro USD)
    const creditsMicroUsd = verified.amountCents * 10_000
    if (verified.amountCents !== order.amountCents) {
      logger.warn('实付与订单金额不一致,按实付入账', {
        orderId: order.id,
        orderCents: order.amountCents,
        paidCents: verified.amountCents,
      })
    }

    await tx
      .update(orders)
      .set({ status: 'paid', paidAt: verified.paidAt ?? new Date() })
      .where(eq(orders.id, order.id))

    await tx.insert(creditLedger).values({
      userId: order.userId,
      deltaMicroUsd: creditsMicroUsd,
      type: 'topup',
      refType: 'order',
      refId: order.id,
      note: `${provider.name} ${externalId}`,
    })

    logger.info('入账成功', { orderId: order.id, userId: order.userId, creditsMicroUsd })
    return { applied: true, userId: order.userId, creditsMicroUsd }
  })
}

/** 余额 = 流水求和。没有余额字段,不会对不上账。 */
export async function getBalanceMicroUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${creditLedger.deltaMicroUsd}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
  return Number(row?.total ?? 0)
}

/** 记一笔消费或调整。正数=加,负数=扣。 */
export async function appendLedger(input: {
  userId: string
  deltaMicroUsd: number
  type: 'usage' | 'refund' | 'adjustment'
  refType?: string
  refId?: string
  note?: string
}) {
  await db.insert(creditLedger).values({
    userId: input.userId,
    deltaMicroUsd: input.deltaMicroUsd,
    type: input.type,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    note: input.note ?? null,
  })
}
