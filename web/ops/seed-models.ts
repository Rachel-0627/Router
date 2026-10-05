/**
 * 把代码里写死的模型清单灌进数据库(一次性)。
 *
 * 跑法: npm run seed:models
 *
 * 之后模型的唯一来源就是数据库,代码里 models/claude.ts、models/codex.ts
 * 只作为**初始数据**保留,不再被运行时读取。
 *
 * 重复跑是安全的:已存在的 model_id 会被更新而不是插入重复行。
 */
import { CLAUDE_MODELS } from '../lib/pricing/models/claude'
import { CODEX_MODELS } from '../lib/pricing/models/codex'
import { db } from '../lib/db'
import { models } from '../lib/db/schema-models'
import { env } from '../lib/env'
import type { ModelSeed } from '../lib/pricing/types'
import { GLM_MODELS } from '../lib/pricing/models/glm'

function toRow(m: ModelSeed, order: number) {
  return {
    modelId: m.id,
    upstreamId: m.upstreamId,
    productGroup: m.group,
    displayName: m.displayName,
    blurb: m.blurb,
    contextWindow: m.contextWindow,
    recommended: m.recommended ?? false,
    legacy: m.legacy ?? false,
    status: 'active',
    sortOrder: order,
    listInput: m.listPrice.input,
    listOutput: m.listPrice.output,
    listCacheRead: m.listPrice.cacheRead,
    listCacheWrite: m.listPrice.cacheWrite,
    listPriceTiers: m.listPriceTiers ?? null,
    upstreamCny: m.upstreamCny,
    pricesVerifiedAt: new Date(),
  }
}

async function main() {
  if (!env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 未配置')
    process.exit(2)
  }
  const all = [...CLAUDE_MODELS, ...CODEX_MODELS, ...GLM_MODELS]
  let inserted = 0
  let updated = 0

  for (const [i, m] of all.entries()) {
    const row = toRow(m, (i + 1) * 10)
    const res = await db
      .insert(models)
      .values(row)
      .onConflictDoUpdate({
        target: models.modelId,
        // 只更新价格和元数据,**不动 status 和 sortOrder** ——
        // 那两项是你在后台调的,重跑种子不该把你的调整覆盖掉
        set: {
          upstreamId: row.upstreamId,
          productGroup: row.productGroup,
          displayName: row.displayName,
          blurb: row.blurb,
          contextWindow: row.contextWindow,
          listInput: row.listInput,
          listOutput: row.listOutput,
          listCacheRead: row.listCacheRead,
          listCacheWrite: row.listCacheWrite,
          listPriceTiers: row.listPriceTiers,
          upstreamCny: row.upstreamCny,
          pricesVerifiedAt: row.pricesVerifiedAt,
          updatedAt: new Date(),
        },
      })
      .returning({ createdAt: models.createdAt, updatedAt: models.updatedAt })
    const r = res[0]
    if (r && r.createdAt.getTime() === r.updatedAt.getTime()) inserted++
    else updated++
  }

  const total = await db.select({ id: models.modelId }).from(models)
  console.log(`✅ 新增 ${inserted} 个 · 更新 ${updated} 个 · 库里共 ${total.length} 个模型`)
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ 灌数据失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
