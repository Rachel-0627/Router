/**
 * 我们自己签发的 API Key。
 *
 * 架构(A 方案):用户拿到的是**我们的** key,不是 new-api 的。
 *   好处:限流/日额度/封号全在我们手里;换上游或换 new-api 实例,用户无感。
 *
 * 安全约定:
 *   - 明文 key **只在创建时返回一次**,之后任何接口都拿不到
 *   - 库里只存 SHA-256(不可逆),泄库也拿不到能用的 key
 *   - 用 SHA-256 而不是 scrypt:key 是 256 位高熵随机串,不存在被字典爆破的风险,
 *     而网关每个请求都要查一次,必须快。密码才需要慢哈希。
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const PREFIX = 'sk-gr-'
/** 32 字节 = 256 位熵,足够 */
const KEY_BYTES = 32

export type GeneratedKey = {
  /** 明文,只此一次 */
  plaintext: string
  hash: string
  /** 展示用,如 sk-gr-ab12…yz89 */
  display: string
}

function base62(buf: Buffer): string {
  const A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let out = ''
  for (const b of buf) out += A[b % 62]
  return out
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

export function generateKey(): GeneratedKey {
  const plaintext = PREFIX + base62(randomBytes(KEY_BYTES))
  return { plaintext, hash: hashKey(plaintext), display: maskKey(plaintext) }
}

/** 脱敏展示:保留前缀后 4 位和末 4 位 */
export function maskKey(plaintext: string): string {
  const body = plaintext.slice(PREFIX.length)
  if (body.length <= 8) return `${PREFIX}****`
  return `${PREFIX}${body.slice(0, 4)}…${body.slice(-4)}`
}

/** 从请求头里取 key。Anthropic 用 x-api-key,OpenAI 用 Authorization: Bearer。 */
export function extractKey(headers: Headers): string | null {
  const x = headers.get('x-api-key')
  if (x && x.startsWith(PREFIX)) return x
  const auth = headers.get('authorization')
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (m && m[1].startsWith(PREFIX)) return m[1]
  }
  return null
}

/** 定长比较,防时序侧信道(虽然哈希查库已经基本免疫,但便宜) */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export const KEY_PREFIX = PREFIX
