/** 给网关测试准备数据:一个用户 + 一把 key(可选带余额)。输出 JSON 供测试脚本用。 */
import { db } from '../lib/db'
import { users, apiKeys, creditLedger } from '../lib/db/schema'
import { generateKey } from '../lib/keys'
import { env } from '../lib/env'

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL ?? '')) {
    console.error('拒绝运行:只允许对本机数据库使用')
    process.exit(2)
  }
  const funded = (process.argv[2] ?? 'funded') === 'funded'
  const group = process.argv[3] ?? 'claude'
  const [u] = await db.insert(users).values({ email: `gw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local` }).returning()
  if (funded) {
    await db.insert(creditLedger).values({
      userId: u.id, deltaMicroUsd: 20_000_000, type: 'topup', note: 'fixture',
    })
  }
  const k = generateKey()
  await db.insert(apiKeys).values({
    userId: u.id, name: 'test-key', productGroup: group, keyHash: k.hash, keyPrefix: k.display, status: 'active',
  })
  console.log(JSON.stringify({ userId: u.id, key: k.plaintext }))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
