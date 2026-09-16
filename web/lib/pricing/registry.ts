/**
 * 模型注册表 —— 模型数据的唯一来源,从数据库读,带内存缓存。
 *
 * 为什么要缓存:网关**每个请求**都要查一次模型才能算钱。
 * 每次打库既慢又浪费连接。缓存 60 秒,后台改完最多 1 分钟生效。
 *
 * ⚠️ 读不到就抛错,**绝不退回默认值** —— 拿错价格算钱比拒绝服务糟糕得多。
 *    调用方(网关)接到错误会返回 503,用户重试即可。
 */
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { models, productGroupSettings, type ModelRow, type GroupSettingRow } from '../db/schema-models'
import type { ModelPricing, ProductGroupId, UpstreamGroup, TokenPrices, PriceTier } from './types'
import { SEED_MODELS } from './models'
import { PRODUCT_GROUPS } from './groups'
import { logger } from '../logger'

const CACHE_TTL_MS = 60_000

type Cache = { at: number; list: ModelPricing[]; groups: Map<string, GroupSettingRow> }
const g = globalThis as unknown as { __modelCache?: Cache }

/** 分组设置读不到时的兜底(不应发生,但不能让页面白屏) */
const FALLBACK = { ratio: 0.8, status: 'pending' as const }

/**
 * 数据库行 → 计算层用的结构。
 * 倍率和上架状态从分组设置挂上来,这样 sellPrices() 不用再查一次。
 */
export function rowToPricing(r: ModelRow, group?: GroupSettingRow): ModelPricing {
  return {
    id: r.modelId,
    upstreamId: r.upstreamId,
    group: r.productGroup as ProductGroupId,
    displayName: r.displayName,
    blurb: r.blurb,
    contextWindow: r.contextWindow,
    recommended: r.recommended,
    legacy: r.legacy,
    listPrice: {
      input: r.listInput,
      output: r.listOutput,
      cacheRead: r.listCacheRead,
      cacheWrite: r.listCacheWrite,
    },
    listPriceTiers: (r.listPriceTiers ?? undefined) as PriceTier[] | undefined,
    upstreamCny: r.upstreamCny as Partial<Record<UpstreamGroup, TokenPrices>>,
    // 模型自己的倍率优先,没设才跟分组走
    ratio: r.ratioOverride ?? group?.ratio ?? FALLBACK.ratio,
    groupStatus: (group?.status === 'live' ? 'live' : 'pending'),
  }
}

/** 全部分组设置,后台编辑页要用 */
export async function getGroupSettings(): Promise<GroupSettingRow[]> {
  return db.select().from(productGroupSettings)
}

/** 强制下次读取重新查库。后台增删改后调它,不用等缓存过期。 */
export function invalidateModelCache(): void {
  g.__modelCache = undefined
}

/** 全部**在售**模型。下架的不返回 —— 它们只存在于历史账单里。 */
export async function getModels(): Promise<ModelPricing[]> {
  const c = g.__modelCache
  if (c && Date.now() - c.at < CACHE_TTL_MS) return c.list

  const [rows, settings] = await Promise.all([
    db.select().from(models).where(eq(models.status, 'active')),
    db.select().from(productGroupSettings),
  ])
  const groups = new Map(settings.map((s) => [s.groupId, s]))
  const list = rows
    .sort((a, b) => a.sortOrder - b.sortOrder || a.modelId.localeCompare(b.modelId))
    .map((r) => rowToPricing(r, groups.get(r.productGroup)))

  g.__modelCache = { at: Date.now(), list, groups }
  return list
}

/** 按对外 ID 查。查不到返回 null,由调用方决定怎么办(网关返回 404)。 */
export async function getModelById(id: string): Promise<ModelPricing | null> {
  const list = await getModels()
  return list.find((m) => m.id === id) ?? null
}

export async function getModelsInGroup(group: ProductGroupId): Promise<ModelPricing[]> {
  return (await getModels()).filter((m) => m.group === group)
}

/**
 * 给**营销页**用的容错版本:数据库连不上时退回代码里的初始清单,
 * 而不是让首页 500。
 *
 * ⚠️ 只给展示页用,**网关绝不能用这个** —— 计费必须用库里的真实价格,
 *    读不到宁可返回 503。价格算错比拒绝服务糟糕得多。
 *    降级期间网关同样连不上库,所以不存在"页面显示A价、实际按B价扣费"的窗口。
 */
export async function getModelsForDisplay(): Promise<ModelPricing[]> {
  try {
    return await getModels()
  } catch (e) {
    logger.error('读取模型失败,营销页降级为代码内初始清单', {
      detail: e instanceof Error ? e.message : String(e),
    })
    const ratioOf = new Map(PRODUCT_GROUPS.map((g) => [g.id, g]))
    return SEED_MODELS.map((m) => {
      const g = ratioOf.get(m.group)
      return { ...m, ratio: g?.defaultRatio ?? 0.8, groupStatus: g?.status ?? 'pending' }
    })
  }
}

/** 后台用:包含已下架的,并带上原始行(有 id、状态、排序) */
export async function getAllModelRows(): Promise<ModelRow[]> {
  const rows = await db.select().from(models)
  return rows.sort(
    (a, b) =>
      a.productGroup.localeCompare(b.productGroup) ||
      a.sortOrder - b.sortOrder ||
      a.modelId.localeCompare(b.modelId),
  )
}
