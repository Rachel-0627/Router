'use server'
/**
 * API Key 管理。
 *
 * ⚠️ 明文 key **只在创建时返回这一次**,库里只存 SHA-256。
 *    用户没存下来就只能重新建一把 —— 这是有意的,不是缺陷。
 */
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { generateKey } from '@/lib/keys'
import { logger } from '@/lib/logger'
import { checkRate } from '@/lib/rate-limit'
import { liveGroups } from '@/lib/pricing/groups'

/** 一个账号最多几把 key,防止刷爆 */
const MAX_KEYS_PER_USER = 20

export type CreateKeyState =
  | { ok: true; plaintext: string; name: string; group: string }
  | { ok: false; error: string }
  | undefined

const NameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Give the key a name.' })
  .max(60, { error: 'Name is too long (60 characters max).' })

export async function createKey(_prev: CreateKeyState, formData: FormData): Promise<CreateKeyState> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Please sign in again.' }

  const parsed = NameSchema.safeParse(formData.get('name'))
  if (!parsed.success) {
    return { ok: false, error: z.flattenError(parsed.error).formErrors[0] ?? 'Invalid name.' }
  }

  // 分组必须是当前可购买的,不能靠前端传什么就信什么
  const groups = await liveGroups()
  const requested = String(formData.get('group') ?? groups[0]?.id ?? 'claude')
  const group = groups.find((g) => g.id === requested)
  if (!group) return { ok: false, error: 'That model group is not available.' }

  const gate = await checkRate(`createkey:${user.id}`, 10, 60 * 60)
  if (!gate.ok) return { ok: false, error: 'Too many keys created. Try again later.' }

  try {
    const existing = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, user.id))
    if (existing.length >= MAX_KEYS_PER_USER) {
      return { ok: false, error: `You can have at most ${MAX_KEYS_PER_USER} keys. Delete one first.` }
    }

    const k = generateKey()
    await db.insert(apiKeys).values({
      userId: user.id,
      name: parsed.data,
      productGroup: group.id,
      keyHash: k.hash,
      keyPrefix: k.display,
      status: 'active',
    })
    logger.info('创建 API key', { userId: user.id, group: group.id })
    revalidatePath('/dashboard/keys')
    // 明文只此一次
    return { ok: true, plaintext: k.plaintext, name: parsed.data, group: group.displayName }
  } catch (e) {
    logger.error('创建 key 失败', { userId: user.id, detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: 'Could not create the key. Please try again.' }
  }
}

/** 删除。只能删自己的 —— where 里带 userId,不靠前端传的 id 可信。 */
export async function deleteKey(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const id = String(formData.get('id') ?? '')
  if (!z.uuid().safeParse(id).success) return

  await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
  logger.info('删除 API key', { userId: user.id })
  revalidatePath('/dashboard/keys')
}

/** 启用/禁用。禁用后网关立刻拒绝该 key(findActiveKeyByHash 只查 active)。 */
export async function toggleKey(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const id = String(formData.get('id') ?? '')
  const next = formData.get('next') === 'active' ? 'active' : 'disabled'
  if (!z.uuid().safeParse(id).success) return

  await db
    .update(apiKeys)
    .set({ status: next })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
  logger.info('切换 API key 状态', { userId: user.id, status: next })
  revalidatePath('/dashboard/keys')
}
