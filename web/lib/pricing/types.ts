/** 定价相关的类型定义。数据在 models/,计算在 calculate.ts。 */

export type TokenPrices = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * 上游分组。**不同产品线的分组是两套,不要混用**:
 *   Claude 线  vip → default → claudeExclusive      (价格严格 1:2:4)
 *   Codex 线   codexBudget → codexPlus → codexPro   (上游的 特价/自建plus/自建pro)
 * 数组顺序 = 故障转移的降级顺序(按进货价从低到高)。
 */
export const UPSTREAM_GROUPS = [
  'vip', 'default', 'claudeExclusive',
  'codexBudget', 'codexPlus', 'codexPro',
] as const
export type UpstreamGroup = (typeof UPSTREAM_GROUPS)[number]

/** 上游后台里的原始分组名。配 new-api 渠道和对账时用。 */
export const UPSTREAM_GROUP_LABEL: Record<UpstreamGroup, string> = {
  vip: 'VIP',
  default: '默认分组',
  claudeExclusive: 'Claude 专属',
  codexBudget: '特价分组',
  codexPlus: '自建codex-plus',
  codexPro: '自建codex-pro',
}

/**
 * 长上下文分档 —— 输入超过 minPromptTokens 后换一套价。
 *
 * ⚠️ 这不是可选的优化:GPT 系列在 272,000 token 处价格**翻倍**,
 *    而编码 Agent 恰恰是长上下文大户。不做分档就是按短上下文价卖长上下文。
 *    结构照搬 OpenRouter 的 pricing.overrides。
 */
export type PriceTier = {
  minPromptTokens: number
  prices: TokenPrices
}

export type ModelPricing = {
  /** 对外暴露的模型 ID(用户在请求里写的) */
  id: string
  /** 上游的模型 ID(通常相同) */
  upstreamId: string
  /** 属于哪个产品分组 */
  group: ProductGroupId
  displayName: string
  blurb: string
  contextWindow: number
  recommended?: boolean
  legacy?: boolean
  /** 官方公开价(短上下文档) */
  listPrice: TokenPrices
  /** 官方的长上下文档位。按 minPromptTokens 升序,取最后一个满足的。 */
  listPriceTiers?: PriceTier[]
  /**
   * 各上游分组进货价,CNY / 百万 token。
   * **缺某个分组 = 上游该分组买不到这个模型**,故障转移时必须跳过。
   */
  upstreamCny: Partial<Record<UpstreamGroup, TokenPrices>>
  /**
   * 所属产品分组的售价倍率,由注册表在加载时从数据库挂上来。
   * 挂在模型上而不是另外查一次,是为了让 sellPrices() 保持**同步** ——
   * 否则十几个调用点都要改成异步。
   */
  ratio: number
  /** 所属分组是否已上架。网关据此拒绝未上架分组的请求。 */
  groupStatus: 'live' | 'pending'
}

/** 产品分组 —— 用户在控制台看到并选择的那个 */
/**
 * 产品分组标识。**不是联合类型** —— 分组由用户在后台自定义,
 * 名单存在 product_group_settings 表里,运行时才知道。
 * 校验用 isValidGroupId(),别再写 z.enum。
 */
export type ProductGroupId = string

/** 种子数据用的类型:倍率和上架状态是运行时挂上去的,静态清单里没有 */
export type ModelSeed = Omit<ModelPricing, 'ratio' | 'groupStatus'>
