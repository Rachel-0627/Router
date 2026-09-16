/** 用量查询,给概览和看板用。 */
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../index'
import { apiKeys, usageDaily, type UsageDaily } from '../schema'

const dayString = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)

export async function countActiveKeys(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, 'active')))
  return Number(row?.n ?? 0)
}

/** 近 N 天花了多少(micro USD) */
export async function spendSinceMicroUsd(userId: string, days: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${usageDaily.revenueMicroUsd}), 0)` })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, userId), gte(usageDaily.day, dayString(days))))
  return Number(row?.total ?? 0)
}

/** 明细,按天倒序 */
export async function listUsage(userId: string, days = 30): Promise<UsageDaily[]> {
  return db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, userId), gte(usageDaily.day, dayString(days))))
    .orderBy(desc(usageDaily.day))
}

/** 按模型汇总,给排序条形图用 */
export async function usageByModel(userId: string, days = 30) {
  return db
    .select({
      model: usageDaily.model,
      requests: sql<string>`sum(${usageDaily.requests})`,
      revenue: sql<string>`sum(${usageDaily.revenueMicroUsd})`,
      input: sql<string>`sum(${usageDaily.inputTokens})`,
      cacheRead: sql<string>`sum(${usageDaily.cacheReadTokens})`,
      cacheWrite: sql<string>`sum(${usageDaily.cacheWriteTokens})`,
      output: sql<string>`sum(${usageDaily.outputTokens})`,
    })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, userId), gte(usageDaily.day, dayString(days))))
    .groupBy(usageDaily.model)
    .orderBy(desc(sql`sum(${usageDaily.revenueMicroUsd})`))
}

/** 区间总计 */
export async function usageTotals(userId: string, days = 30) {
  const [row] = await db
    .select({
      requests: sql<string>`coalesce(sum(${usageDaily.requests}),0)`,
      revenue: sql<string>`coalesce(sum(${usageDaily.revenueMicroUsd}),0)`,
      input: sql<string>`coalesce(sum(${usageDaily.inputTokens}),0)`,
      output: sql<string>`coalesce(sum(${usageDaily.outputTokens}),0)`,
      cacheRead: sql<string>`coalesce(sum(${usageDaily.cacheReadTokens}),0)`,
      cacheWrite: sql<string>`coalesce(sum(${usageDaily.cacheWriteTokens}),0)`,
    })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, userId), gte(usageDaily.day, dayString(days))))
  return {
    requests: Number(row?.requests ?? 0),
    revenue: Number(row?.revenue ?? 0),
    input: Number(row?.input ?? 0),
    output: Number(row?.output ?? 0),
    cacheRead: Number(row?.cacheRead ?? 0),
    cacheWrite: Number(row?.cacheWrite ?? 0),
  }
}
