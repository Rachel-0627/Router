/** 运营后台的用户查询。一次 SQL 把余额、消费、key 数都算出来,不要 N+1。 */
import { sql } from 'drizzle-orm'
import { db } from '../index'
import { users, creditLedger, apiKeys, usageDaily } from '../schema'

export type OpsUserRow = {
  id: string
  email: string
  role: string
  status: string
  createdAt: Date
  balanceMicroUsd: number
  toppedUpMicroUsd: number
  spentMicroUsd: number
  keyCount: number
  requests: number
  lastUsedAt: Date | null
}

export async function listUsersForOps(limit = 200): Promise<OpsUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      balance: sql<string>`coalesce((select sum(${creditLedger.deltaMicroUsd}) from ${creditLedger} where ${creditLedger.userId} = ${users.id}), 0)`,
      toppedUp: sql<string>`coalesce((select sum(${creditLedger.deltaMicroUsd}) from ${creditLedger} where ${creditLedger.userId} = ${users.id} and ${creditLedger.deltaMicroUsd} > 0), 0)`,
      spent: sql<string>`coalesce((select -sum(${creditLedger.deltaMicroUsd}) from ${creditLedger} where ${creditLedger.userId} = ${users.id} and ${creditLedger.deltaMicroUsd} < 0), 0)`,
      keys: sql<string>`(select count(*) from ${apiKeys} where ${apiKeys.userId} = ${users.id} and ${apiKeys.status} = 'active')`,
      requests: sql<string>`coalesce((select sum(${usageDaily.requests}) from ${usageDaily} where ${usageDaily.userId} = ${users.id}), 0)`,
      lastUsed: sql<Date | null>`(select max(${apiKeys.lastUsedAt}) from ${apiKeys} where ${apiKeys.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(sql`${users.createdAt} desc`)
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.createdAt,
    balanceMicroUsd: Number(r.balance),
    toppedUpMicroUsd: Number(r.toppedUp),
    spentMicroUsd: Number(r.spent),
    keyCount: Number(r.keys),
    requests: Number(r.requests),
    lastUsedAt: r.lastUsed,
  }))
}

/** 单个用户的完整画像,给详情页用 */
export async function getUserDetail(userId: string) {
  const [u] = await db.select().from(users).where(sql`${users.id} = ${userId}`).limit(1)
  if (!u) return null

  const [byModel, ledger, keys, daily] = await Promise.all([
    db
      .select({
        model: usageDaily.model,
        requests: sql<string>`sum(${usageDaily.requests})`,
        input: sql<string>`sum(${usageDaily.inputTokens})`,
        output: sql<string>`sum(${usageDaily.outputTokens})`,
        cacheRead: sql<string>`sum(${usageDaily.cacheReadTokens})`,
        cacheWrite: sql<string>`sum(${usageDaily.cacheWriteTokens})`,
        revenue: sql<string>`sum(${usageDaily.revenueMicroUsd})`,
        cost: sql<string>`sum(${usageDaily.costMicroUsd})`,
      })
      .from(usageDaily)
      .where(sql`${usageDaily.userId} = ${userId}`)
      .groupBy(usageDaily.model)
      .orderBy(sql`sum(${usageDaily.revenueMicroUsd}) desc`),
    db
      .select()
      .from(creditLedger)
      .where(sql`${creditLedger.userId} = ${userId}`)
      .orderBy(sql`${creditLedger.createdAt} desc`)
      .limit(50),
    db.select().from(apiKeys).where(sql`${apiKeys.userId} = ${userId}`).orderBy(sql`${apiKeys.createdAt} desc`),
    db
      .select({
        day: usageDaily.day,
        revenue: sql<string>`sum(${usageDaily.revenueMicroUsd})`,
        requests: sql<string>`sum(${usageDaily.requests})`,
      })
      .from(usageDaily)
      .where(sql`${usageDaily.userId} = ${userId}`)
      .groupBy(usageDaily.day)
      .orderBy(sql`${usageDaily.day} desc`)
      .limit(30),
  ])

  const n = (v: unknown) => Number(v ?? 0)
  return {
    user: u,
    byModel: byModel.map((r) => ({
      model: r.model,
      requests: n(r.requests),
      input: n(r.input),
      output: n(r.output),
      cacheRead: n(r.cacheRead),
      cacheWrite: n(r.cacheWrite),
      revenue: n(r.revenue),
      cost: n(r.cost),
    })),
    ledger,
    keys,
    daily: daily.map((d) => ({ day: d.day, revenue: n(d.revenue), requests: n(d.requests) })),
  }
}
