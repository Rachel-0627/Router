/**
 * 当前用户查询层(Data Access Layer)。
 *
 * 页面和 Server Action 一律从这里拿用户,**不要**自己解 cookie。
 * 好处是鉴权逻辑只有一处,不会漏。
 */
import 'server-only'
import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users, type User } from '../db/schema'
import { readSession } from './session'

/** 同一次请求内多次调用只查一次库 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const s = await readSession()
  if (!s) return null
  const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1)
  if (!u || u.status !== 'active') return null
  return u
})

/** 需要登录的页面用这个。没登录就返回 null,由调用方 redirect。 */
export async function requireUser(): Promise<User | null> {
  return getCurrentUser()
}
