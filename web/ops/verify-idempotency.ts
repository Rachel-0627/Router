/**
 * 幂等入账验证 —— 支付链路最容易赔钱的一环,必须能反复验证。
 *
 * 验的是 lib/credits.ts 的三道防线在**真实 Postgres**下是否成立:
 *   并发打 N 次同一个支付回调,只能加一次钱。
 *
 * 跑法: npm run verify:idem
 *
 * ⚠️ 只操作自己造的那一个测试账号,**不碰其他数据**。
 *    (早期版本会清空整张 users 表,把真实注册的账号也删了 —— 已修正)
 *    仍保留"只允许本机数据库"的防线。
 */
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { users, orders, creditLedger, apiKeys, usageDaily } from '../lib/db/schema'
import { settlePayment, getBalanceMicroUsd } from '../lib/credits'
import { nexapay } from '../lib/payment/nexapay'
import { env } from '../lib/env'

const CONCURRENT_CALLBACKS = 5
const ORDER_CENTS = 2000
const ORDER_CREDITS = 20_000_000 // $20,micro USD

/** 硬防线:只允许对本机数据库跑,因为本脚本会清表。 */
function assertLocalDb() {
  const url = env.DATABASE_URL ?? ''
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)
  if (!isLocal) {
    console.error(
      '\n❌ 拒绝运行:本脚本会清空数据表,只能对本机数据库使用。\n' +
        `   当前 DATABASE_URL 指向的不是 localhost。\n` +
        '   本地起库: docker run -d --name ai-gw-pg -e POSTGRES_PASSWORD=devpass \\\n' +
        '              -e POSTGRES_USER=gateway -e POSTGRES_DB=gateway \\\n' +
        '              -p 55432:5432 postgres:17-alpine\n',
    )
    process.exit(2)
  }
}

/** 只删这一个测试账号自己的数据。顺序:先删引用 users 的表,最后删 users。 */
async function cleanup(userId: string) {
  await db.delete(usageDaily).where(eq(usageDaily.userId, userId))
  await db.delete(apiKeys).where(eq(apiKeys.userId, userId))
  await db.delete(creditLedger).where(eq(creditLedger.userId, userId))
  await db.delete(orders).where(eq(orders.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

async function main() {
  assertLocalDb()

  // 打桩:冒充支付商回查。不碰生产代码,只在本进程内替换方法。
  const externalId = `chg_verify_${Date.now()}`
  nexapay.verifyPayment = async () => ({
    externalId,
    status: 'paid' as const,
    amountCents: ORDER_CENTS,
    currency: 'USD',
    paidAt: new Date(),
  })

  const [u] = await db.insert(users).values({ email: `idem_${Date.now()}@test.local` }).returning()
  console.log(`建了临时测试账号 ${u.email}`)
  await db.insert(orders).values({
    userId: u.id,
    provider: 'nexapay',
    externalId,
    amountCents: ORDER_CENTS,
    creditsMicroUsd: ORDER_CREDITS,
    status: 'pending',
  })
  console.log(`建好订单 ${externalId},应到账 $${(ORDER_CREDITS / 1e6).toFixed(2)}`)
  console.log(`初始余额: $${((await getBalanceMicroUsd(u.id)) / 1e6).toFixed(2)}\n`)

  console.log(`并发打 ${CONCURRENT_CALLBACKS} 次同一个回调(模拟支付商重试风暴)…`)
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENT_CALLBACKS }, () => settlePayment(externalId, 'nexapay')),
  )
  const applied = results.filter((r) => r.status === 'fulfilled' && r.value.applied).length
  const skipped = results.filter((r) => r.status === 'fulfilled' && !r.value.applied).length
  const failed = results.filter((r) => r.status === 'rejected').length

  const rows = await db.select().from(creditLedger).where(eq(creditLedger.userId, u.id))
  const balance = await getBalanceMicroUsd(u.id)

  console.log(`  入账 ${applied} 次 / 跳过 ${skipped} 次 / 报错 ${failed} 次`)
  console.log(`  流水条数 ${rows.length}   最终余额 $${(balance / 1e6).toFixed(2)}\n`)

  const ok = rows.length === 1 && balance === ORDER_CREDITS && applied === 1
  if (!ok) {
    await cleanup(u.id)
    console.error(
      `❌ 幂等被击穿!期望「1 条流水 / $${(ORDER_CREDITS / 1e6).toFixed(2)} / 入账1次」,` +
        `实际「${rows.length} 条 / $${(balance / 1e6).toFixed(2)} / 入账${applied}次」`,
    )
    process.exit(1)
  }
  console.log('✅ 幂等成立:并发重复回调只加了一次钱。')
  await cleanup(u.id)
  process.exit(0)
}

main().catch((e) => {
  console.error('\n❌ 验证过程出错:', e instanceof Error ? e.message : e)
  process.exit(1)
})
