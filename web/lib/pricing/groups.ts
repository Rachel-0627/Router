/**
 * 产品分组 —— 用户建 key 时选的那个。
 *
 * 和上游分组的区别:
 *   上游分组(vip/默认/专属/codex-pro…)是**进货渠道**,用户永远看不到
 *   产品分组(Claude/Codex)是**卖什么**,用户可见可选
 *
 * 定价基准:**官方 list price**,两条线都按八折(× 0.8)。
 *
 * 为什么是八折而不是更低:可及的竞争对手(官方、OpenRouter、APIMart 一类)
 * 都在官方价的 80-105% 区间。八折已经是明确的价格优势,
 * 而折扣打得太狠反而会让用户怀疑服务的可持续性 —— 低价本身会变成可信度的敌人。
 *
 * 每组倍率独立配置(进货成本差异很大,以后要分开调价时不用改结构),
 * 可用环境变量覆盖,调价不用改代码。
 */
import { env } from '../env'
import type { ProductGroupId, UpstreamGroup } from './types'

export type ProductGroup = {
  id: ProductGroupId
  /** 对外展示名,不要暴露上游分组名 */
  displayName: string
  blurb: string
  /** 售价倍率默认值,可被环境变量覆盖 */
  defaultRatio: number
  /** 覆盖用的环境变量名 */
  ratioEnvKey: 'PRICE_RATIO_CLAUDE' | 'PRICE_RATIO_CODEX'
  /** 这一组的降级链,按进货价从低到高 */
  fallbackChain: UpstreamGroup[]
  /** live = 可购买;pending = 页面上展示但不可用 */
  status: 'live' | 'pending'
  pendingReason?: string
}

export const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: 'claude',
    displayName: 'Claude',
    blurb: 'Claude models for Claude Code, Cline, and the Anthropic SDK.',
    defaultRatio: 0.8,
    ratioEnvKey: 'PRICE_RATIO_CLAUDE',
    fallbackChain: ['vip', 'default', 'claudeExclusive'],
    status: 'live',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    blurb: 'GPT models for Codex, Cursor, and OpenAI-compatible clients.',
    defaultRatio: 0.8,
    ratioEnvKey: 'PRICE_RATIO_CODEX',
    fallbackChain: ['codexBudget', 'codexPlus', 'codexPro'],
    status: 'pending',
    pendingReason:
      '上游这批自建 Codex 池的 prompt 注入行为尚未验证 —— 必须先跑一轮注入/缓存实测再上架,' +
      '不能重蹈"通用场景不可做"的覆辙。',
  },
]

export const getGroup = (id: ProductGroupId) => PRODUCT_GROUPS.find((g) => g.id === id)

/** 某组的实际售价倍率。环境变量优先,没配就用默认值。 */
export function groupRatio(id: ProductGroupId): number {
  const g = getGroup(id)
  if (!g) return env.PRICE_RATIO_OF_OFFICIAL
  const override = env[g.ratioEnvKey]
  return typeof override === 'number' && override > 0 ? override : g.defaultRatio
}

/** 可购买的分组 */
export const liveGroups = () => PRODUCT_GROUPS.filter((g) => g.status === 'live')
