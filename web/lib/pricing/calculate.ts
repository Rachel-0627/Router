/**
 * 售价与毛利计算 —— 全项目唯一的价格计算入口。
 * 别处不许自己乘除价格,一律调这里。
 */
import { env } from '../env'
import { MODELS, type ModelPricing, type TokenPrices } from './models'

/** 汇率:把上游人民币成本折算成美元。保守取值,留缓冲。 */
export const CNY_PER_USD = 7.2

/** 售价 = list price × 倍率 */
export function sellPrices(m: ModelPricing): TokenPrices {
  const r = env.PRICE_RATIO_OF_OFFICIAL
  return {
    input: m.listPrice.input * r,
    output: m.listPrice.output * r,
    cacheRead: m.listPrice.cacheRead * r,
    cacheWrite: m.listPrice.cacheWrite * r,
  }
}

/** 成本(美元/百万 token) */
export function costPrices(m: ModelPricing): TokenPrices {
  const f = CNY_PER_USD
  return {
    input: m.upstreamCny.input / f,
    output: m.upstreamCny.output / f,
    cacheRead: m.upstreamCny.cacheRead / f,
    cacheWrite: m.upstreamCny.cacheWrite / f,
  }
}

/** 单个模型的进货毛利率(0-100) */
export function grossMarginPct(m: ModelPricing): number {
  const s = sellPrices(m).input
  const c = costPrices(m).input
  return s === 0 ? 0 : ((s - c) / s) * 100
}

/** 用户省了多少(相对 list price),用于定价页展示 */
export function savingsPct(): number {
  return Math.round((1 - env.PRICE_RATIO_OF_OFFICIAL) * 100)
}

/** 一次请求的费用(美元),给用量计费用 */
export function requestCostUsd(
  m: ModelPricing,
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
): { revenue: number; cost: number } {
  const s = sellPrices(m)
  const c = costPrices(m)
  const per = (p: TokenPrices) =>
    (tokens.input * p.input +
      tokens.output * p.output +
      (tokens.cacheRead ?? 0) * p.cacheRead +
      (tokens.cacheWrite ?? 0) * p.cacheWrite) /
    1_000_000
  return { revenue: per(s), cost: per(c) }
}

/** 定价页用的一行数据 */
export type PricingRow = ModelPricing & { sell: TokenPrices }
export const pricingRows = (): PricingRow[] =>
  MODELS.map((m) => ({ ...m, sell: sellPrices(m) }))

/** 展示价格:小数位随量级自适应,避免全是 $0.00 */
export function fmtPrice(usdPerMillion: number): string {
  if (usdPerMillion >= 1) return `$${usdPerMillion.toFixed(2)}`
  if (usdPerMillion >= 0.1) return `$${usdPerMillion.toFixed(2)}`
  return `$${usdPerMillion.toFixed(3)}`
}
