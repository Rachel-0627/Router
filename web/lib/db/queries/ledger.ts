/** 流水与订单查询,给交易记录页和看板用。 */
import { desc, eq } from 'drizzle-orm'
import { db } from '../index'
import { creditLedger, orders, type LedgerEntry, type Order } from '../schema'

export async function listLedger(userId: string, limit = 100): Promise<LedgerEntry[]> {
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
}

export async function listOrders(userId: string, limit = 50): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}
