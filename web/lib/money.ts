/**
 * 金额换算。全项目只在这里做金额转换,别处不许自己乘除。
 *
 * micro USD : 百万分之一美元,$1 = 1_000_000。内部计算和存储统一用它。
 * cents     : 美分,$1 = 100。只用于支付平台交互。
 */
export const MICRO_PER_USD = 1_000_000
export const MICRO_PER_CENT = 10_000

export const usdToMicro = (usd: number) => Math.round(usd * MICRO_PER_USD)
export const microToUsd = (micro: number) => micro / MICRO_PER_USD
export const centsToMicro = (cents: number) => cents * MICRO_PER_CENT
export const microToCents = (micro: number) => Math.round(micro / MICRO_PER_CENT)

/** 展示给用户的美元金额,如 $12.34 / $0.0042 */
export function formatUsd(micro: number, opts?: { maxDecimals?: number }): string {
  const usd = microToUsd(micro)
  const abs = Math.abs(usd)
  // 小额多保留几位小数,否则用户看到的全是 $0.00
  const decimals = opts?.maxDecimals ?? (abs > 0 && abs < 0.01 ? 4 : 2)
  return `$${usd.toFixed(decimals)}`
}

/** 每百万 token 的价格 → 单 token 的 micro USD */
export const perMillionToMicroPerToken = (usdPerMillion: number) =>
  (usdPerMillion * MICRO_PER_USD) / 1_000_000
