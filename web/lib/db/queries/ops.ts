/**
 * 运营指标查询 —— 只给 /ops-2f8a 用。
 *
 * ⚠️ 最重要的一个数是「可支配现金」:
 *      可支配现金 = 已收到的钱 − 用户还没消耗的余额
 *    用户充的钱在他花完之前**不是你的**。动它就是资不抵债。
 */
import { sql } from 'drizzle-orm'
import { db } from '../index'
import { creditLedger, orders, usageDaily, users } from '../schema'

const n = (v: unknown) => Number(v ?? 0)

export async function fundSafety() {
  // 已到账现金(美分)
  const [cash] = await db
    .select({ cents: sql<string>`coalesce(sum(${orders.amountCents}),0)` })
    .from(orders)
    .where(sql`${orders.status} = 'paid'`)

  // 用户未消耗余额 = 全部流水求和(充值为正,消费为负)
  const [liability] = await db
    .select({ micro: sql<string>`coalesce(sum(${creditLedger.deltaMicroUsd}),0)` })
    .from(creditLedger)

  const cashMicro = n(cash?.cents) * 10_000 // 1 cent = 10000 micro USD
  const owedMicro = Math.max(0, n(liability?.micro))
  return { cashMicro, owedMicro, disposableMicro: cashMicro - owedMicro }
}

/** 经营数据。days=0 表示今天。 */
export async function business(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const [row] = await db
    .select({
      requests: sql<string>`coalesce(sum(${usageDaily.requests}),0)`,
      revenue: sql<string>`coalesce(sum(${usageDaily.revenueMicroUsd}),0)`,
      cost: sql<string>`coalesce(sum(${usageDaily.costMicroUsd}),0)`,
    })
    .from(usageDaily)
    .where(sql`${usageDaily.day} >= ${since}`)

  const revenue = n(row?.revenue)
  const cost = n(row?.cost)
  return {
    requests: n(row?.requests),
    revenue,
    cost,
    grossMicro: revenue - cost,
    grossPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
  }
}

export async function userStats() {
  const [total] = await db.select({ n: sql<string>`count(*)` }).from(users)
  const [paying] = await db
    .select({ n: sql<string>`count(distinct ${orders.userId})` })
    .from(orders)
    .where(sql`${orders.status} = 'paid'`)
  const [new7d] = await db
    .select({ n: sql<string>`count(*)` })
    .from(users)
    .where(sql`${users.createdAt} >= now() - interval '7 days'`)

  const t = n(total?.n)
  const p = n(paying?.n)
  return { total: t, paying: p, new7d: n(new7d?.n), conversionPct: t > 0 ? (p / t) * 100 : 0 }
}

/** 订单状态分布 —— 拒付率要等支付商接通才有真数据 */
export async function orderStats() {
  const rows = await db
    .select({ status: orders.status, n: sql<string>`count(*)`, cents: sql<string>`coalesce(sum(${orders.amountCents}),0)` })
    .from(orders)
    .groupBy(orders.status)
  return rows.map((r) => ({ status: r.status, count: n(r.n), cents: n(r.cents) }))
}
