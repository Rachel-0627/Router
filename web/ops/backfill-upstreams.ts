/**
 * 把现有的单一上游迁进 upstreams 表,并让所有产品分组指过去。
 *
 * ⚠️ **必须在代码改读新表之前跑完并验证。** 顺序反了会出现
 *    "代码已经去新表找地址,但表里还是空的" —— 所有请求 503。
 *
 * 地址来源(按优先级):
 *   1. app_secrets 里加密存的 NEWAPI_BASE_URL(后台填的,最新)
 *   2. 环境变量 NEWAPI_BASE_URL(老路径)
 *
 * 幂等:重复跑不会重复建,也不会覆盖你手工改过的地址。
 * 跑法:DATABASE_URL=<目标库> npx tsx ops/backfill-upstreams.ts
 */
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { upstreams } from '../lib/db/schema-upstreams'
import { productGroupSettings } from '../lib/db/schema-models'
import { getSecret } from '../lib/secrets/store'
import { env } from '../lib/env'

const ID = 'zexitongxue'

async function main() {
  // 显式传入优先 —— 对线上库跑时拿不到 KEK(钥匙只在 Vercel),解不开密文,
  // 这时就得人工把地址传进来。地址不是秘密,明文传没问题。
  const arg = process.argv[2]?.trim()
  const fromDb = arg ? undefined : await getSecret('NEWAPI_BASE_URL')
  const base = (arg || fromDb || env.NEWAPI_BASE_URL || '').replace(/\/$/, '')
  if (!base) {
    console.error(
      '❌ 找不到现有上游地址。要么在后台填好,要么直接传进来:\n' +
        '   npx tsx ops/backfill-upstreams.ts https://zexitongxue.com',
    )
    process.exit(1)
  }
  if (!/^https?:\/\/[^\s/]+$/i.test(base)) {
    console.error(`❌ 地址形态不对:${base} —— 应形如 https://example.com,不带路径和末尾斜杠`)
    process.exit(1)
  }
  const src = arg ? '命令行传入' : fromDb ? '后台填的' : '环境变量'
  console.log(`现有地址:${base}（来源:${src}）\n`)

  const [existing] = await db.select().from(upstreams).where(eq(upstreams.id, ID))
  if (existing) {
    console.log(`  上游 ${ID} 已存在,地址 ${existing.baseUrl} —— 不覆盖`)
  } else {
    await db.insert(upstreams).values({
      id: ID,
      displayName: '泽西同学',
      baseUrl: base,
      authStyle: 'bearer', // new-api 系
      note: '首个上游,从旧的单一配置迁移而来',
      sortOrder: 10,
    })
    console.log(`  ✅ 已建上游 ${ID}`)
  }

  // 没挂上游的分组,一律指向它 —— 已挂的不动
  const groups = await db.select().from(productGroupSettings)
  for (const g of groups) {
    if (g.upstreamId) {
      console.log(`  ${g.groupId.padEnd(8)} 已挂 ${g.upstreamId},跳过`)
      continue
    }
    await db
      .update(productGroupSettings)
      .set({ upstreamId: ID, updatedAt: new Date() })
      .where(eq(productGroupSettings.groupId, g.groupId))
    console.log(`  ${g.groupId.padEnd(8)} → ${ID}`)
  }

  console.log('\n回填完成。当前状态:')
  for (const u of await db.select().from(upstreams)) {
    console.log(`  上游 ${u.id.padEnd(14)} ${u.displayName.padEnd(10)} ${u.authStyle.padEnd(10)} ${u.baseUrl}`)
  }
  for (const g of await db.select().from(productGroupSettings)) {
    console.log(`  分组 ${g.groupId.padEnd(14)} → 上游 ${(g.upstreamId || '(无)').padEnd(14)} key槽位 ${g.secretSlot}`)
  }
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
