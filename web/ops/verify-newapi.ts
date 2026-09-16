/**
 * lib/newapi 联调验证 —— 对着**真实的 new-api 实例**跑一遍,证明封装是对的。
 *
 * 跑法: npm run verify:newapi
 * 本地起一个 new-api:
 *   docker run -d --name new-api -p 3001:3000 calciumion/new-api:latest
 *   然后浏览器开 http://localhost:3001 做初始化,建管理员账号
 * 再把 NEWAPI_BASE_URL / NEWAPI_ADMIN_USER / NEWAPI_ADMIN_PASSWORD 填进 .env.local
 *
 * ⚠️ 会在目标实例上创建测试用户和 token。只对本地/测试实例跑。
 */
import { env } from '../lib/env'
import { QUOTA_PER_USD, quotaToMicroUsd, microUsdToQuota, NewApiError } from '../lib/newapi/client'
import { createUser, findUserByUsername, getUser } from '../lib/newapi/users'
import { createToken, listTokens, deleteToken } from '../lib/newapi/tokens'
import { fetchConsumeLogs } from '../lib/newapi/logs'

const ok = (m: string) => console.log(`  ✅ ${m}`)
const warn = (m: string) => console.log(`  ⚠️  ${m}`)

function assertLocal() {
  const u = env.NEWAPI_BASE_URL ?? ''
  if (!/localhost|127\.0\.0\.1/.test(u)) {
    console.error(`\n❌ 拒绝运行:会创建测试数据,只允许对本地实例跑。当前 NEWAPI_BASE_URL=${u}\n`)
    process.exit(2)
  }
}

async function main() {
  assertLocal()
  console.log(`目标: ${env.NEWAPI_BASE_URL}\n`)

  console.log('1) 单位换算')
  if (quotaToMicroUsd(QUOTA_PER_USD) !== 1_000_000) throw new Error('quota→micro 换算错')
  if (microUsdToQuota(1_000_000) !== QUOTA_PER_USD) throw new Error('micro→quota 换算错')
  ok(`${QUOTA_PER_USD} quota = $1 = 1000000 micro USD`)

  console.log('\n2) 登录 + 建用户')
  const username = `verify_${Date.now()}`
  await createUser({ username, password: 'Verify123!pass', displayName: 'verify bot' })
  ok(`建用户 ${username}`)

  const found = await findUserByUsername(username)
  if (!found) throw new Error('建完却查不到,findUserByUsername 有问题')
  ok(`按用户名查到 id=${found.id} quota=${found.quota} group=${found.group}`)

  const byId = await getUser(found.id)
  if (byId.username !== username) throw new Error('按 id 查到的用户对不上')
  ok(`按 id 查一致`)

  console.log('\n3) token 增删查')
  const tname = `verify-key-${Date.now()}`
  await createToken({ name: tname, quotaMicroUsd: 5_000_000 })
  const list = await listTokens()
  const t = list.items.find((x) => x.name === tname)
  if (!t) throw new Error('建了 token 却查不到')
  ok(`建 token id=${t.id} remain=${t.remain_quota} (=$${(quotaToMicroUsd(t.remain_quota) / 1e6).toFixed(2)})`)

  if (/\*{3,}/.test(t.key)) {
    warn(`key 被脱敏: ${t.key} —— 证实「建 key 后展示给用户」这条路走不通`)
  } else {
    warn(`key 未脱敏(${t.key.slice(0, 6)}…),与 2026-09-15 的实测结论不同,请复核 tokens.ts 的注释`)
  }

  await deleteToken(t.id)
  const after = await listTokens()
  if (after.items.some((x) => x.id === t.id)) throw new Error('删了还在')
  ok('删 token 成功')

  console.log('\n4) 日志接口连通性')
  const now = Math.floor(Date.now() / 1000)
  const logs = await fetchConsumeLogs({ startSec: now - 86400, endSec: now })
  ok(`日志接口通,返回 ${logs.items.length} 条(total=${logs.total})`)
  if (logs.items.length === 0) {
    warn('没有真实日志 —— logs.ts 的字段形状仍未验证,接上游后必须先核对再启用聚合')
  }

  console.log('\n5) 加额度(预期被合规开关拦住)')
  try {
    const { addQuota } = await import('../lib/newapi/users')
    await addQuota(found.id, 1_000_000, 'verify')
    ok('加额度成功 —— 说明合规条款已确认')
  } catch (e) {
    if (e instanceof NewApiError && /合规|未启用/.test(e.message)) {
      warn('加额度被拦截(符合预期):需你本人在 new-api 后台确认合规条款')
    } else throw e
  }

  console.log('\n✅ lib/newapi 联调通过')
  process.exit(0)
}

main().catch((e) => {
  console.error('\n❌ 验证失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
