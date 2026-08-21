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

    // ── 金额核对:支付商确认的实付必须等于订单金额 ──
    if (verified.amountCents !== order.amountCents) {
      logger.error('回查金额与订单不符,拒绝入账', {
        orderId: order.id,
        expectedCents: order.amountCents,
        verifiedCents: verified.amountCents,
      })
      throw badRequest(undefined, { reason: 'amount_mismatch', orderId: order.id })
    }

    await tx
      .update(orders)
      .set({ status: 'paid', paidAt: verified.paidAt ?? new Date() })
      .where(eq(orders.id, order.id))

    await tx.insert(creditLedger).values({
      userId: order.userId,
      deltaMicroUsd: order.creditsMicroUsd,
      type: 'topup',
      refType: 'order',
      refId: order.id,
      note: `${provider.name} ${externalId}`,
    })

    logger.info('入账成功', {
      orderId: order.id,
      userId: order.userId,
      creditsMicroUsd: order.creditsMicroUsd,
    })
    return { applied: true, userId: order.userId, creditsMicroUsd: order.creditsMicroUsd }
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
