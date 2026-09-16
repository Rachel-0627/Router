/**
 * 认证核心逻辑验证 —— 密码哈希、会话签名、注册约束。
 *
 * 跑法: npm run verify:auth
 * ⚠️ 会写测试用户,只允许对本地库跑(同 verify-idempotency 的防线)。
 *
 * 注:HTTP 层(Server Action / cookie 下发)靠 `npm run dev` 人工点一遍,
 *    脚本里跑不了 —— cookies() 需要真实的请求上下文。
 */
import { eq } from 'drizzle-orm'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { hashPassword, verifyPassword } from '../lib/auth/password'
import { getBalanceMicroUsd } from '../lib/credits'
import { env } from '../lib/env'

const ok = (m: string) => console.log(`  ✅ ${m}`)

function assertLocalDb() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL ?? '')) {
    console.error('\n❌ 拒绝运行:会写测试数据,只允许对本机数据库使用。\n')
    process.exit(2)
  }
}

async function main() {
  assertLocalDb()

  console.log('1) 密码哈希 (scrypt)')
  const plain = 'Str0ngPass!23'
  const hash = await hashPassword(plain)
  if (!hash.startsWith('scrypt$')) throw new Error('哈希格式不对')
  if (hash.includes(plain)) throw new Error('哈希里竟然含明文!')
  ok(`格式 ${hash.split('$').slice(0, 4).join('$')}$…  长度 ${hash.length}`)
  if (!(await verifyPassword(plain, hash))) throw new Error('正确密码验不过')
  ok('正确密码 → 通过')
  if (await verifyPassword('wrong-password', hash)) throw new Error('错误密码竟然通过了')
  ok('错误密码 → 拒绝')
  if (await verifyPassword(plain, null)) throw new Error('空哈希竟然通过了')
  ok('空哈希(OAuth 用户) → 拒绝')
  if (await verifyPassword(plain, 'garbage')) throw new Error('垃圾数据竟然通过了')
  ok('畸形哈希 → 拒绝且不抛错')
  const hash2 = await hashPassword(plain)
  if (hash === hash2) throw new Error('两次哈希相同,说明没加盐')
  ok('同一密码两次哈希不同(加盐生效)')

  console.log('\n2) 会话 JWT 签名')
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET 未配置')
  const key = new TextEncoder().encode(env.AUTH_SECRET)
  const jwt = await new SignJWT({ userId: 'u-123' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key)
  const { payload } = await jwtVerify(jwt, key, { algorithms: ['HS256'] })
  if (payload.userId !== 'u-123') throw new Error('JWT 解出来对不上')
  ok('签发 + 校验通过')
  const wrongKey = new TextEncoder().encode('x'.repeat(48))
  let rejected = false
  try { await jwtVerify(jwt, wrongKey, { algorithms: ['HS256'] }) } catch { rejected = true }
  if (!rejected) throw new Error('换密钥竟然也能验过!')
  ok('伪造签名 → 拒绝')

  console.log('\n3) 注册约束')
  const email = `verify_${Date.now()}@test.local`
  const [u] = await db.insert(users).values({ email, passwordHash: hash }).returning()
  ok(`建用户 ${u.id.slice(0, 8)}… status=${u.status}`)

  const dup = await db
    .insert(users)
    .values({ email, passwordHash: hash })
    .onConflictDoNothing({ target: users.email })
    .returning()
  if (dup.length !== 0) throw new Error('同邮箱竟然能注册两次!')
  ok('同邮箱重复注册 → 被唯一索引挡住,返回空')

  const bal = await getBalanceMicroUsd(u.id)
  if (bal !== 0) throw new Error(`新用户余额应为 0,实际 ${bal}`)
  ok('新用户余额 = $0.00(流水求和,无余额字段)')

  await db.delete(users).where(eq(users.id, u.id))
  ok('清理测试用户')

  console.log('\n✅ 认证核心逻辑全部通过')
  process.exit(0)
}

main().catch((e) => {
  console.error('\n❌ 验证失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
