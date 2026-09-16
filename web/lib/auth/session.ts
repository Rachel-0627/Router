/**
 * 会话 —— 无状态 JWT 存在 HttpOnly cookie 里(Next 官方推荐做法)。
 *
 * ⚠️ Next 16 起 cookies() 是**异步**的,必须 await。
 * ⚠️ payload 只放 userId,不放邮箱/余额等任何敏感或会变的数据。
 */
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { env } from '../env'

const COOKIE = 'gr_session'
const MAX_AGE_SEC = 7 * 24 * 60 * 60

function key(): Uint8Array {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET 未配置或太短(至少 32 字符)。生成:openssl rand -base64 32')
  }
  return new TextEncoder().encode(env.AUTH_SECRET)
}

export type SessionPayload = { userId: string }

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(key())

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SEC,
    path: '/',
  })
}

/** 读当前会话。无效/过期一律返回 null,不抛错。 */
export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    const userId = payload.userId
    return typeof userId === 'string' ? { userId } : null
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
