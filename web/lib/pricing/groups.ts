/**
 * 产品分组 —— 用户建 key 时选的那个,决定能调哪些模型、按什么倍率计价。
 *
 * **唯一真相是数据库表 product_group_settings**,后台能增删改,加一条
 * 就是新开一条产品线,不用改代码。下面的 SEED_GROUPS 只在表为空时兜底
 * (全新环境首次启动),不是配置入口。
 *
 * 和上游分组的区别(别混):
 *   上游分组(vip/默认/专属/codex-pro…)是**进货渠道**,用户永远看不到,
 *                                       记在每个模型的 upstreamCny 里
 *   产品分组(Claude/Codex/…)        是**卖什么**,用户可见可选
 *
 * 定价基准:官方 list price × 倍率。八折是因为可及的竞争对手(官方、
 * OpenRouter、APIMart 一类)都在官方价的 80-105% 区间 —— 八折已是明确
 * 优势,而折扣打太狠反而让人怀疑服务可持续,低价会变成可信度的敌人。
 *
 * ⚠️ 降级链**不在这里**。它由 calculate.ts 从每个模型的 upstreamCny
 *    推导(哪些档有进货价就走哪些),比在分组上写死准确得多。
 */
import { db } from '../db'
import { productGroupSettings } from '../db/schema-models'
import { env } from '../env'

export type ProductGroup = {
  id: string
  /** 对外展示名,不要暴露上游分组名 */
  displayName: string
  blurb: string
  ratio: number
  /** live = 可购买;pending = 页面展示但不可用 */
  status: 'live' | 'pending'
  /** 这组用哪把上游 key(app_secrets 槽位名);空 = 退回通用 key */
  secretSlot: string
  /** 转发协议。Claude 系 anthropic,GPT 系 openai。发错上游直接报错 */
  protocol: 'anthropic' | 'openai'
  sortOrder: number
}

/** 表为空时的初始分组。**不是配置入口** —— 改分组请去后台。 */
export const SEED_GROUPS: ProductGroup[] = [
  {
    id: 'claude',
    displayName: 'Claude',
    blurb: 'Claude models for Claude Code, Cline, and the Anthropic SDK.',
    ratio: 0.8,
    status: 'live',
    secretSlot: 'NEWAPI_SERVICE_KEY_CLAUDE',
    protocol: 'anthropic',
    sortOrder: 10,
  },
  {
    id: 'codex',
    displayName: 'Codex',
    blurb: 'GPT models for Codex, Cursor, and OpenAI-compatible clients.',
    ratio: 0.8,
    status: 'pending',
    secretSlot: 'NEWAPI_SERVICE_KEY_CODEX',
    protocol: 'openai',
    sortOrder: 20,
  },
]

/**
 * 某分组默认的密钥槽位名。
 * 放在这里而不是 secrets/slots.ts:那边已经 import 本文件,反过来会成循环依赖。
 */
export function defaultSlotForGroup(groupId: string): string {
  return `NEWAPI_SERVICE_KEY_${groupId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
}

// ── 缓存:网关每个请求都要查分组,不能每次都打库 ──
let cache: { groups: ProductGroup[]; at: number } | null = null
const TTL_MS = 60_000

export function invalidateGroupCache() {
  cache = null
}

function rowToGroup(r: typeof productGroupSettings.$inferSelect): ProductGroup {
  return {
    id: r.groupId,
    displayName: r.displayName || r.groupId,
    blurb: r.blurb,
    ratio: r.ratio,
    status: r.status === 'live' ? 'live' : 'pending',
    // 空值兜底:历史数据里这列可能是空的。不补的话会退回通用 key,
    // 而那把多半没配 —— 网关会直接 503,排查起来还很隐蔽。
    secretSlot: r.secretSlot || defaultSlotForGroup(r.groupId),
    protocol: r.protocol === 'openai' ? 'openai' : 'anthropic',
    sortOrder: r.sortOrder,
  }
}

/**
 * 全部分组,按 sortOrder 排序。
 * 读库失败时退回种子数据 —— 门面页不该因为数据库抖一下就 500。
 */
export async function getGroups(): Promise<ProductGroup[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.groups
  let groups: ProductGroup[]
  try {
    const rows = await db.select().from(productGroupSettings)
    groups = rows.length > 0 ? rows.map(rowToGroup).sort((a, b) => a.sortOrder - b.sortOrder) : SEED_GROUPS
  } catch {
    groups = SEED_GROUPS
  }
  cache = { groups, at: Date.now() }
  return groups
}

export async function getGroup(id: string): Promise<ProductGroup | undefined> {
  return (await getGroups()).find((g) => g.id === id)
}

/** 某组的售价倍率。查不到就用全局兜底值。 */
export async function groupRatio(id: string): Promise<number> {
  return (await getGroup(id))?.ratio ?? env.PRICE_RATIO_OF_OFFICIAL
}

/** 可购买的分组 */
export async function liveGroups(): Promise<ProductGroup[]> {
  return (await getGroups()).filter((g) => g.status === 'live')
}

/** 这个分组标识合法吗 —— 替代原来写死的 z.enum(['claude','codex']) */
export async function isValidGroupId(id: string): Promise<boolean> {
  return (await getGroups()).some((g) => g.id === id)
}
