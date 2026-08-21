/**
 * 模型价格数据。
 *
 * listPrice   Anthropic 公开价格,USD / 百万 token —— 用户的心理参照系
 * upstreamCny 上游 VIP 分组进货价,CNY / 百万 token —— 只用于内部毛利监控,不对外
 *
 * ⚠️ 售价不在这里写死,由 calculate.ts 用 listPrice × 倍率算出来。
 *    调价只改环境变量 PRICE_RATIO_OF_OFFICIAL。
 */
export type TokenPrices = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type ModelPricing = {
  /** 对外暴露的模型 ID(用户在请求里写的) */
  id: string
  /** 上游的模型 ID(通常相同) */
  upstreamId: string
  displayName: string
  blurb: string
  contextWindow: number
  /** 定价页高亮推荐 */
  recommended?: boolean
  /** 老版本,折叠在 Legacy 区 */
  legacy?: boolean
  listPrice: TokenPrices
  upstreamCny: TokenPrices
}

export const MODELS: ModelPricing[] = [
  {
    id: 'claude-sonnet-5',
    upstreamId: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    blurb: 'Best balance of speed and quality. Recommended for most agent work.',
    contextWindow: 1_000_000,
    recommended: true,
    listPrice: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    upstreamCny: { input: 0.88, output: 4.4, cacheRead: 0.088, cacheWrite: 1.1 },
  },
  {
    id: 'claude-opus-4-8',
    upstreamId: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    blurb: 'Flagship coding model for long-horizon, multi-file work.',
    contextWindow: 1_000_000,
    listPrice: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    upstreamCny: { input: 2.2, output: 11, cacheRead: 0.22, cacheWrite: 2.75 },
  },
  {
    id: 'claude-fable-5',
    upstreamId: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    blurb: 'Highest capability for the hardest reasoning tasks.',
    contextWindow: 1_000_000,
    listPrice: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    upstreamCny: { input: 4.125, output: 20.625, cacheRead: 0.4125, cacheWrite: 5.3625 },
  },
  {
    id: 'claude-sonnet-4-6',
    upstreamId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    blurb: 'Previous-generation Sonnet. Stable fallback.',
    contextWindow: 1_000_000,
    listPrice: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    upstreamCny: { input: 1.32, output: 6.6, cacheRead: 0.132, cacheWrite: 1.65 },
  },
  {
    id: 'claude-haiku-4-5',
    upstreamId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    blurb: 'Fastest and cheapest. Good for simple, high-volume calls.',
    contextWindow: 200_000,
    listPrice: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    upstreamCny: { input: 0.44, output: 2.2, cacheRead: 0.044, cacheWrite: 0.55 },
  },
]

export const getModel = (id: string) => MODELS.find((m) => m.id === id)
