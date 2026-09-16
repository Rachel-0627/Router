/**
 * Claude 产品线的模型。
 *
 * listPrice   Anthropic 公开价,USD / 百万 token —— 用户的心理参照系
 * upstreamCny 上游各分组进货价,CNY / 百万 token —— 只用于内部毛利监控
 *
 * ⚠️ 这条线的官方价**没有长上下文分档**(实测 2026-09-15,来源 OpenRouter)。
 *    分档只存在于上一代的 sonnet-4.5 / sonnet-4,不在本清单内。
 */
import type { ModelSeed } from '../types'

export const CLAUDE_MODELS: ModelSeed[] = [
  {
    id: 'claude-sonnet-5',
    upstreamId: 'claude-sonnet-5',
    group: 'claude',
    displayName: 'Claude Sonnet 5',
    blurb: 'Best balance of speed and quality. Recommended for most agent work.',
    contextWindow: 1_000_000,
    recommended: true,
    // $3/$15 是原定 2026-09-01 生效后又被取消的涨价,别再抄错
    listPrice: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    upstreamCny: {
      vip: { input: 0.88, output: 4.4, cacheRead: 0.088, cacheWrite: 1.1 },
      default: { input: 1.76, output: 8.8, cacheRead: 0.176, cacheWrite: 2.2 },
      claudeExclusive: { input: 3.52, output: 17.6, cacheRead: 0.352, cacheWrite: 4.4 },
    },
  },
  {
    id: 'claude-opus-4-8',
    upstreamId: 'claude-opus-4-8',
    group: 'claude',
    displayName: 'Claude Opus 4.8',
    blurb: 'Flagship coding model for long-horizon, multi-file work.',
    contextWindow: 1_000_000,
    listPrice: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    upstreamCny: {
      vip: { input: 2.2, output: 11, cacheRead: 0.22, cacheWrite: 2.75 },
      default: { input: 4.4, output: 22, cacheRead: 0.44, cacheWrite: 5.5 },
      claudeExclusive: { input: 8.8, output: 44, cacheRead: 0.88, cacheWrite: 11 },
    },
  },
  {
    id: 'claude-fable-5',
    upstreamId: 'claude-fable-5',
    group: 'claude',
    displayName: 'Claude Fable 5',
    blurb: 'Highest capability for the hardest reasoning tasks.',
    contextWindow: 1_000_000,
    listPrice: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    // ⚠️ 上游没有「默认分组」档,VIP 一挂直接跳 4 倍价的专属,没有中间缓冲
    upstreamCny: {
      vip: { input: 4.125, output: 20.625, cacheRead: 0.4125, cacheWrite: 5.3625 },
      claudeExclusive: { input: 16.5, output: 82.5, cacheRead: 1.65, cacheWrite: 21.45 },
    },
  },
  {
    id: 'claude-sonnet-4-6',
    upstreamId: 'claude-sonnet-4-6',
    group: 'claude',
    displayName: 'Claude Sonnet 4.6',
    blurb: 'Previous-generation Sonnet. Stable fallback.',
    contextWindow: 1_000_000,
    listPrice: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    upstreamCny: {
      vip: { input: 1.32, output: 6.6, cacheRead: 0.132, cacheWrite: 1.65 },
      default: { input: 2.64, output: 13.2, cacheRead: 0.264, cacheWrite: 3.3 },
      claudeExclusive: { input: 5.28, output: 26.4, cacheRead: 0.528, cacheWrite: 6.6 },
    },
  },
  {
    id: 'claude-haiku-4-5',
    upstreamId: 'claude-haiku-4-5-20251001',
    group: 'claude',
    displayName: 'Claude Haiku 4.5',
    blurb: 'Fastest and cheapest. Good for simple, high-volume calls.',
    contextWindow: 200_000,
    listPrice: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    // ⚠️ 上游没有「Claude 专属」档,两档都挂就彻底没兜底
    upstreamCny: {
      vip: { input: 0.44, output: 2.2, cacheRead: 0.044, cacheWrite: 0.55 },
      default: { input: 0.88, output: 4.4, cacheRead: 0.088, cacheWrite: 1.1 },
    },
  },
]
