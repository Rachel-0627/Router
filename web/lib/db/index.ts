/**
 * 数据库连接。
 * 用全局单例,避免 Next.js 热重载时反复建连接池把数据库连满。
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> }

function connectionString(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未配置。营销站不需要数据库,但认证/计费/用量模块需要 —— ' +
        '请在 Supabase 或 Neon 开一个 Postgres,把连接串填进环境变量。',
    )
  }
  return env.DATABASE_URL
}

const sql =
  globalForDb.__sql ??
  postgres(connectionString(), {
    max: env.NODE_ENV === 'production' ? 10 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
  })

if (env.NODE_ENV !== 'production') globalForDb.__sql = sql

export const db = drizzle(sql, { schema })
export { schema }

/** 健康检查:连不上就抛错,给启动自检和监控用 */
export async function pingDb(): Promise<boolean> {
  await sql`select 1`
  return true
}
