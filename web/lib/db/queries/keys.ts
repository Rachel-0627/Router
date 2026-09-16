/** API Key 查询。网关热路径,保持轻。 */
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../index'
import { apiKeys, users, type ApiKey, type User } from '../schema'

export type KeyWithUser = { key: ApiKey; user: User }

/** 网关鉴权用:按哈希查 key + 它的主人。禁用的 key 和封禁的用户都查不出来。 */
export async function findActiveKeyByHash(hash: string): Promise<KeyWithUser | null> {
  const [row] = await db
    .select({ key: apiKeys, user: users })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.status, 'active'), eq(users.status, 'active')))
    .limit(1)
  return row ?? null
}

export async function listKeys(userId: string): Promise<ApiKey[]> {
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt))
}

export async function touchKeyUsed(keyId: string): Promise<void> {
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId))
}
