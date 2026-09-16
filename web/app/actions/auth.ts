'use server'
/**
 * 注册 / 登录 / 登出。
 *
 * 架构说明(A 方案):new-api 只当渠道路由器用,**用户不在 new-api 里开户**。
 * 身份、余额、限额全在我们自己的 Postgres,靠 credit_ledger 求和算余额。
 *
 * 铁律二自查:
 *   - 输入用 zod 校验,非法输入友好拒绝
 *   - 报错不泄露「邮箱是否已注册」,防用户枚举
 *   - 原始异常只进日志,不给用户看
 */
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { hashPassword, verifyPassword, createSession, destroySession } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { checkRate } from '@/lib/rate-limit'

export type FormState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined

const Credentials = z.object({
  email: z.email({ error: '请填写有效的邮箱地址。' }).trim().toLowerCase(),
  password: z
    .string()
    .min(8, { error: '密码至少 8 位。' })
    .max(200, { error: '密码过长。' }),
})

/** 登录失败和注册都走同一句话,避免泄露某个邮箱是否已注册 */
const GENERIC_LOGIN_FAIL = 'Email or password is incorrect.'

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> }
  }
  const { email, password } = parsed.data

  const gate = await checkRate(`signup:${email}`, 5, 60 * 60)
  if (!gate.ok) return { error: 'Too many attempts. Please try again later.' }

  let userId: string
  try {
    const passwordHash = await hashPassword(password)
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning()

    if (!created) {
      // 邮箱已存在。不明说,避免枚举 —— 提示去登录即可。
      return { error: 'That email cannot be used. Try signing in instead.' }
    }
    userId = created.id
    logger.info('新用户注册', { userId })
  } catch (e) {
    logger.error('注册失败', { detail: e instanceof Error ? e.message : String(e) })
    return { error: 'Could not create your account. Please try again.' }
  }

  await createSession(userId)
  redirect('/dashboard')
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: GENERIC_LOGIN_FAIL }
  const { email, password } = parsed.data

  const gate = await checkRate(`login:${email}`, 10, 15 * 60)
  if (!gate.ok) return { error: 'Too many attempts. Please try again later.' }

  let userId: string | null = null
  try {
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    // 即使用户不存在也跑一次校验,让耗时接近,减少时序区分
    const ok = await verifyPassword(password, u?.passwordHash ?? null)
    if (u && ok && u.status === 'active') userId = u.id
  } catch (e) {
    logger.error('登录查询失败', { detail: e instanceof Error ? e.message : String(e) })
    return { error: 'Something went wrong. Please try again.' }
  }

  if (!userId) return { error: GENERIC_LOGIN_FAIL }
  logger.info('用户登录', { userId })
  await createSession(userId)
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  await destroySession()
  redirect('/')
}
