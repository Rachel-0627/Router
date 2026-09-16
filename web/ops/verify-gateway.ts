/**
 * 网关代理端到端验证 —— 项目里风险最高的一段代码,必须能反复验。
 *
 * 前置(三个终端 / 后台跑):
 *   1. docker start ai-gw-pg
 *   2. npm run mock:upstream            # 假上游 :3099
 *   3. NEWAPI_BASE_URL=http://localhost:3099 npm run build && npx next start -p 3115
 * 然后: npm run verify:gateway
 *
 * 为什么用假上游:真上游(new-api→泽西)还没有 key,但代理层的鉴权/余额/
 * 限流/流式/计费逻辑必须先证明是对的,不能等上线才发现算错钱。
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { users, apiKeys, creditLedger, usageDaily } from '../lib/db/schema'
import { generateKey } from '../lib/keys'
import { getModelById } from '../lib/pricing/registry'
import { requestCostUsd } from '../lib/pricing/calculate'
import { env } from '../lib/env'

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3115'
const MODEL = 'claude-sonnet-5'
/**
 * 假上游固定返回的用量(输入1000/输出350/缓存读5000/缓存写200),
 * 按 claude-sonnet-5 的 list 价和当前倍率算出应收多少。
 * **不写死数字** —— 调价后这个测试还要能用。
 */
let EXPECTED_REVENUE_MICRO = 0
async function computeExpected() {
  const m = await getModelById(MODEL)
  if (!m) throw new Error(`价目表里没有 ${MODEL},先跑 npm run seed:models`)
  EXPECTED_REVENUE_MICRO = Math.round(
    requestCostUsd(m, { input: 1000, output: 350, cacheRead: 5000, cacheWrite: 200 }).revenue * 1_000_000,
  )
}

const ok = (m: string) => console.log(`  ✅ ${m}`)
let failures = 0
const bad = (m: string) => { console.log(`  ❌ ${m}`); failures++ }

async function seed(funded: boolean) {
  const [u] = await db.insert(users)
    .values({ email: `gwv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.local` })
    .returning()
  if (funded) {
    await db.insert(creditLedger).values({ userId: u.id, deltaMicroUsd: 20_000_000, type: 'topup', note: 'verify' })
  }
  const k = generateKey()
  await db.insert(apiKeys).values({
    userId: u.id, name: 'verify', keyHash: k.hash, keyPrefix: k.display, status: 'active',
  })
  return { userId: u.id, key: k.plaintext }
}

const post = (key: string | null, body: unknown) =>
  fetch(`${GATEWAY}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
  })

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL ?? '')) {
    console.error('拒绝运行:只允许对本机数据库使用'); process.exit(2)
  }
  await computeExpected()
  console.log(`网关: ${GATEWAY} · 预期扣费 ${EXPECTED_REVENUE_MICRO} micro\n`)

  const funded = await seed(true)
  const broke = await seed(false)

  console.log('1) 鉴权与余额')
  const r1 = await post(null, { model: MODEL })
  if (r1.status === 401) ok('不带 key → 401')
  else bad(`不带 key 应 401,实际 ${r1.status}`)

  const r2 = await post('sk-gr-' + 'x'.repeat(32), { model: MODEL })
  if (r2.status === 401) ok('伪造 key → 401')
  else bad(`伪造 key 应 401,实际 ${r2.status}`)

  const r3 = await post(broke.key, { model: MODEL })
  if (r3.status === 402) ok('零余额 → 402')
  else bad(`零余额应 402,实际 ${r3.status}`)

  console.log('\n2) 模型与分组校验')
  const rx = await post(funded.key, { model: 'gpt-5.6-terra' })
  if (rx.status === 403) ok('Claude key 调 Codex 模型 → 403 跨组拒绝')
  else bad(`跨组调用应 403,实际 ${rx.status}`)
  const ry = await post(funded.key, { model: 'totally-made-up' })
  if (ry.status === 404) ok('未知模型 → 404')
  else bad(`未知模型应 404,实际 ${ry.status}`)

  console.log('\n3) 上游故障降级')
  // 用真实模型名 + _mock_fail 开关:网关会先校验模型,假模型走不到上游
  const r4 = await post(funded.key, { model: MODEL, _mock_fail: true })
  if (r4.status === 503 && r4.headers.get('retry-after')) {
    ok(`上游 502 → 降级为 503 + Retry-After: ${r4.headers.get('retry-after')}`)
  } else {
    bad(`上游故障应返回 503+Retry-After,实际 ${r4.status} / ${r4.headers.get('retry-after')}`)
  }

  console.log('\n4) 非流式转发')
  const r5 = await post(funded.key, { model: MODEL, messages: [{ role: 'user', content: 'hi' }] })
  const j5 = (await r5.json()) as { content?: { text: string }[] }
  if (r5.status === 200 && j5.content?.[0]?.text === 'Hello world') ok('内容完整透传')
  else bad(`非流式转发异常: ${r5.status}`)

  console.log('\n5) 流式转发(SSE)')
  const r6 = await post(funded.key, { model: MODEL, stream: true, messages: [{ role: 'user', content: 'hi' }] })
  const text = await r6.text()
  const events = (text.match(/^event: /gm) ?? []).length
  if (events === 5) ok(`收到 5 个 SSE 事件,顺序完整`)
  else bad(`SSE 事件数应为 5,实际 ${events}`)
  if (text.includes('Hello') && text.includes('world')) ok('分片内容无损')
  else bad('SSE 内容有损')

  console.log('\n6) 计费准确性')
  // 流式计费在 flush 时落账,等一下
  let rows: { deltaMicroUsd: number }[] = []
  for (let i = 0; i < 40; i++) {
    rows = await db.select({ deltaMicroUsd: creditLedger.deltaMicroUsd }).from(creditLedger)
      .where(and(eq(creditLedger.userId, funded.userId), eq(creditLedger.type, 'usage')))
    if (rows.length >= 2) break
    await new Promise((r) => setTimeout(r, 150))
  }
  if (rows.length === 2) ok('2 次成功请求 → 2 条 usage 流水(故障请求不计费)')
  else bad(`应有 2 条 usage 流水,实际 ${rows.length}`)
  const allExact = rows.every((r) => r.deltaMicroUsd === -EXPECTED_REVENUE_MICRO)
  if (allExact) ok(`每次扣费精确等于 ${EXPECTED_REVENUE_MICRO} micro USD`)
  else bad(`扣费不符: ${rows.map((r) => r.deltaMicroUsd).join(', ')}`)

  const [agg] = await db.select().from(usageDaily).where(eq(usageDaily.userId, funded.userId))
  if (agg && agg.requests === 2 && agg.revenueMicroUsd === EXPECTED_REVENUE_MICRO * 2) {
    const margin = ((agg.revenueMicroUsd - agg.costMicroUsd) / agg.revenueMicroUsd) * 100
    ok(`日汇总正确:${agg.requests} 次,营收 ${agg.revenueMicroUsd},成本 ${agg.costMicroUsd},毛利 ${margin.toFixed(1)}%`)
  } else {
    bad(`日汇总异常: ${JSON.stringify(agg)}`)
  }

  console.log('\n7) Key 生命周期联动')
  // 禁用后网关必须立刻拒绝 —— findActiveKeyByHash 只认 active
  await db.update(apiKeys).set({ status: 'disabled' }).where(eq(apiKeys.userId, funded.userId))
  const r7 = await post(funded.key, { model: MODEL })
  if (r7.status === 401) ok('禁用 key → 网关立刻 401')
  else bad(`禁用后应 401,实际 ${r7.status}`)

  await db.update(apiKeys).set({ status: 'active' }).where(eq(apiKeys.userId, funded.userId))
  const r8 = await post(funded.key, { model: MODEL, messages: [] })
  if (r8.status === 200) ok('重新启用 → 恢复可用')
  else bad(`重新启用后应 200,实际 ${r8.status}`)

  await db.delete(apiKeys).where(eq(apiKeys.userId, funded.userId))
  const r9 = await post(funded.key, { model: MODEL })
  if (r9.status === 401) ok('删除 key → 网关 401')
  else bad(`删除后应 401,实际 ${r9.status}`)

  console.log(failures === 0 ? '\n✅ 网关全部通过' : `\n❌ ${failures} 项失败`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('\n❌ 验证出错:', e instanceof Error ? e.message : e); process.exit(1) })
