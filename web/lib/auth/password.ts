/**
 * 密码哈希 —— 用 Node 内置的 scrypt,不引第三方库。
 *
 * 为什么不用 bcrypt:它要原生编译,在 Vercel 这类平台上容易踩坑。
 * scrypt 是 Node 标准库自带的正经密码 KDF(抗 GPU 暴力破解),够用且零依赖。
 *
 * 存储格式: scrypt$N$r$p$<salt-base64>$<hash-base64>
 * 把参数一起存进去,以后调强度不会让老密码失效。
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// N=2^15 是 OWASP 对 scrypt 的推荐下限,单次约 50-100ms
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 32

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** 验证密码。任何格式异常都返回 false,绝不抛错泄露信息。 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = await scrypt(plain.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    })
    // 定长比较,防时序侧信道
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
