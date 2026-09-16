'use server'
/**
 * 用户管理:发额度、封禁/解封。
 *
 * ⚠️ 发额度是**直接送钱**,必须可审计:
 *   - 强制填原因,写进流水的 note 里
 *   - 记谁发的
 *   - 单次上限,防手滑多打个 0
 *   - 只写 credit_ledger(只追加),不碰任何余额字段
 */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { users, creditLedger } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { logger } from '@/lib/logger'

/** 单次发放上限($),防手滑。要发更多就多发几次,每次都留痕。 */
const MAX_GRANT_USD = 500

export type GrantState = { ok: boolean; message: string } | undefined

const GrantSchema = z.object({
  userId: z.uuid({ error: '用户无效' }),
  amountUsd: z.coerce
    .number()
    .refine((n) => n !== 0, { error: '金额不能为 0' })
    .refine((n) => Math.abs(n) <= MAX_GRANT_USD, { error: `单次不能超过 $${MAX_GRANT_USD}` }),
  reason: z.string().trim().min(2, { error: '必须填原因(会写进流水,以后对账要看)' }).max(120),
})

export async function grantCredits(_prev: GrantState, formData: FormData): Promise<GrantState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '未授权' }
  const parsed = GrantSchema.safeParse({
    userId: formData.get('userId'),
    amountUsd: formData.get('amountUsd'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error).slice(0, 160) }
  const { userId, amountUsd, reason } = parsed.data

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, message: '用户不存在' }

  const by = (await getCurrentUser())?.email ?? '?'
  const micro = Math.round(amountUsd * 1_000_000)

  await db.insert(creditLedger).values({
    userId,
    deltaMicroUsd: micro,
    // adjustment 而不是 topup —— 这不是用户付钱买的,对账时要能区分
    type: 'adjustment',
    refType: 'manual_grant',
    note: `${amountUsd >= 0 ? '+' : ''}$${amountUsd} by ${by} · ${reason}`,
  })

  logger.info('手动发放额度', { targetUserId: userId, amountUsd, by, reason })
  revalidatePath('/ops-2f8a/users')
  return {
    ok: true,
    message: `已给 ${target.email} ${amountUsd >= 0 ? '发放' : '扣除'} $${Math.abs(amountUsd)}`,
  }
}

/** 封禁 / 解封。封禁后网关立刻拒绝该用户所有 key。 */
export async function setUserStatus(formData: FormData): Promise<GrantState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '未授权' }
  const userId = String(formData.get('userId') ?? '')
  const next = formData.get('next') === 'active' ? 'active' : 'suspended'
  if (!z.uuid().safeParse(userId).success) return { ok: false, message: '参数无效' }

  const me = await getCurrentUser()
  if (me?.id === userId) return { ok: false, message: '不能封禁自己' }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, message: '用户不存在' }

  await db.update(users).set({ status: next, updatedAt: new Date() }).where(eq(users.id, userId))
  logger.info('用户状态变更', { targetUserId: userId, status: next, by: me?.email })
  revalidatePath('/ops-2f8a/users')
  return { ok: true, message: `${target.email} 已${next === 'active' ? '解封' : '封禁'}` }
}
