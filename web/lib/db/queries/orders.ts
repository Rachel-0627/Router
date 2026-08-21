/** 订单相关查询。金额一律整数,不用浮点。 */
import { and, eq } from 'drizzle-orm'
import { db } from '../index'
import { orders } from '../schema'
import { centsToMicro } from '../../money'

export async function createPendingOrder(input: {
  userId: string
  provider: string
  externalId: string
  amountCents: number
}) {
  const [row] = await db
    .insert(orders)
    .values({
      userId: input.userId,
      provider: input.provider,
      externalId: input.externalId,
      amountCents: input.amountCents,
      // 充多少用多少,无赠送 —— 到账额度 = 实付金额
      creditsMicroUsd: centsToMicro(input.amountCents),
      status: 'pending',
    })
    .returning()
  return row
}

export async function findOrder(provider: string, externalId: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.provider, provider), eq(orders.externalId, externalId)))
    .limit(1)
  return row ?? null
}

export async function listUserOrders(userId: string, limit = 50) {
  return db.select().from(orders).where(eq(orders.userId, userId)).limit(limit)
}
