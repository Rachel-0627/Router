/**
 * 售价与毛利计算 —— 全项目唯一的价格计算入口。
 * 别处不许自己乘除价格,一律调这里。
 *
 * 三条区分:
 *   售价  listPrice × **所属产品分组的倍率**,与走哪个上游渠道无关(用户无感)
 *   成本  必须带上实际走的上游分组,降级到贵渠道时成本翻倍甚至四倍
 *   分档  输入超过阈值(GPT 系列是 272k)换一套价,Claude 线目前没有分档
 */
import { getModelsForDisplay } from './registry'
import {
  UPSTREAM_GROUPS,
  type ModelPricing,
  type TokenPrices,
  type UpstreamGroup,
} from './types'

/** 汇率:把上游人民币成本折算成美元。保守取值,留缓冲。 */
export const CNY_PER_USD = 7.2

/**
 * 按输入 token 数挑档位。没有分档就是 listPrice 本身。
 * 档位按 minPromptTokens 升序,取**最后一个**满足的。
 */
export function listPriceFor(m: ModelPricing, promptTokens = 0): TokenPrices {
  if (!m.listPriceTiers?.length) return m.listPrice
  let chosen = m.listPrice
  for (const tier of [...m.listPriceTiers].sort((a, b) => a.minPromptTokens - b.minPromptTokens)) {
    if (promptTokens >= tier.minPromptTokens) chosen = tier.prices
  }
  return chosen
}

/**
 * 售价 = 该档 list price × 倍率。
 * 倍率是注册表加载模型时挂上来的(m.ratio),不在这里查库 —— 保持同步。
 */
export function sellPrices(m: ModelPricing, promptTokens = 0): TokenPrices {
  const r = m.ratio
  const base = listPriceFor(m, promptTokens)
  return {
    input: base.input * r,
    output: base.output * r,
    cacheRead: base.cacheRead * r,
    cacheWrite: base.cacheWrite * r,
  }
}

/** 这个模型真实可用的降级链(上游确实有货的那些档),按优先级排序 */
export function fallbackChain(m: ModelPricing): UpstreamGroup[] {
  return UPSTREAM_GROUPS.filter((g) => m.upstreamCny[g] != null)
}

/** 主力上游分组 = 降级链的第一档 */
export function primaryGroup(m: ModelPricing): UpstreamGroup | null {
  return fallbackChain(m)[0] ?? null
}

/** 最后一道兜底分组 */
export function lastResortGroup(m: ModelPricing): UpstreamGroup | null {
  const chain = fallbackChain(m)
  return chain.length > 0 ? chain[chain.length - 1] : null
}

/**
 * 指定上游分组的成本(美元/百万 token)。
 * 返回 null = 上游该分组买不到这个模型,故障转移时要跳过。
 */
export function costPrices(m: ModelPricing, group?: UpstreamGroup): TokenPrices | null {
  const g = group ?? primaryGroup(m)
  if (!g) return null
  const cny = m.upstreamCny[g]
  if (!cny) return null
  const f = CNY_PER_USD
  return {
    input: cny.input / f,
    output: cny.output / f,
    cacheRead: cny.cacheRead / f,
    cacheWrite: cny.cacheWrite / f,
  }
}

/** 指定分组的进货毛利率(0-100)。分组不可用时返回 null。 */
export function grossMarginPct(m: ModelPricing, group?: UpstreamGroup): number | null {
  const cost = costPrices(m, group)
  if (!cost) return null
  const s = sellPrices(m).input
  if (s === 0) return 0
  return ((s - cost.input) / s) * 100
}

/**
 * 最坏情况毛利率 —— 降级到最贵的兜底分组时还剩多少。
 * ⚠️ 运营后台必须显示它,不能只看主力分组。
 */
export function worstCaseMarginPct(m: ModelPricing): number | null {
  const g = lastResortGroup(m)
  return g ? grossMarginPct(m, g) : null
}

/**
 * 一次请求的收入与成本(美元),给用量计费用。
 *
 * @param group 这次请求**实际走的**上游分组。不传则按主力分组估算,
 *              但真实计费一定要传,否则降级期间成本会被低估。
 * cost 为 null = 该分组没有价格数据,属异常,调用方应记日志告警。
 */
export function requestCostUsd(
  m: ModelPricing,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  group?: UpstreamGroup,
): { revenue: number; cost: number | null } {
  const cacheRead = tokens.cacheRead ?? 0
  const cacheWrite = tokens.cacheWrite ?? 0
  // 分档看的是**全部输入**(含缓存部分),这和官方计费口径一致
  const promptTokens = tokens.input + cacheRead + cacheWrite

  const per = (p: TokenPrices) =>
    (tokens.input * p.input + tokens.output * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) /
    1_000_000

  const cost = costPrices(m, group)
  return { revenue: per(sellPrices(m, promptTokens)), cost: cost ? per(cost) : null }
}

/** 用户省了多少(相对 list price)。传倍率,不自己查。 */
export function savingsPct(ratio: number): number {
  return Math.round((1 - ratio) * 100)
}

/**
 * 定价页/落地页用的一行数据。
 * 用容错版读取 —— 数据库抖一下不该让门面页 500。
 */
export type PricingRow = ModelPricing & { sell: TokenPrices }
export async function pricingRows(): Promise<PricingRow[]> {
  const list = await getModelsForDisplay()
  return list.map((m) => ({ ...m, sell: sellPrices(m) }))
}

/** 展示价格:小数位随量级自适应,避免全是 $0.00 */
export function fmtPrice(usdPerMillion: number): string {
  if (usdPerMillion >= 0.1) return `$${usdPerMillion.toFixed(2)}`
  return `$${usdPerMillion.toFixed(3)}`
}
