/**
 * 把一个账号标记为管理员(或取消)。
 *
 *   npm run ops:grant  you@example.com          授予
 *   npm run ops:grant  you@example.com revoke   取消
 *
 * 为什么用命令行而不是网页:先有鸡还是先有蛋 —— 网页授权本身需要管理员权限。
 * 命令行能直接连库,是最可靠的引导方式。线上库也能跑,把 DATABASE_URL 换成线上的即可。
 */
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { users } from '../lib/db/schema'
import { env } from '../lib/env'

async function main() {
  if (!env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 未配置')
    process.exit(2)
  }
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  const revoke = process.argv[3] === 'revoke'
  if (!email) {
    console.error('用法: npm run ops:grant <邮箱> [revoke]')
    const all = await db.select({ email: users.email, role: users.role }).from(users)
    if (all.length) {
      console.error('\n库里现有账号:')
      for (const u of all) console.error(`  ${u.email}  ${u.role === 'admin' ? '← 管理员' : ''}`)
    }
    process.exit(2)
  }

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!u) {
    console.error(`❌ 找不到账号 ${email} —— 先去网站注册一个,再回来授权`)
    process.exit(1)
  }

  const role = revoke ? 'user' : 'admin'
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, u.id))
  console.log(`✅ ${email} 现在是 ${role === 'admin' ? '管理员,登录后即可访问 /ops-2f8a' : '普通用户'}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ 失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
