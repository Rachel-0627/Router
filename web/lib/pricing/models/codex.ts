/**
 * Codex 产品线的模型(OpenAI 系)。
 *
 * ⚠️ **这一组尚未上架** —— 上游这批「自建 codex」池的 prompt 注入行为没验证过。
 *    见 lib/pricing/groups.ts 的 pendingReason。价格数据先备好,验证通过才开卖。
 *
 * ⚠️ **必须处理长上下文分档**:官方在 272,000 token 处价格翻倍,
 *    而编码 Agent 恰恰长上下文居多。不分档 = 按短价卖长请求。
 *    数据来源:上游 /api/pricing 的 official_pricing 字段(2026-09-15)。
 *
 * 进货价三档取自上游:特价分组 / 自建codex-plus / 自建codex-pro。
 *
 * ⚠️ **gpt-5.6-luna 故意不上架**:上游自建池按固定价收,不分模型(plus 档一律 ¥0.4/M),
 *    而 luna 官方价只有 $0.2/M,三折卖 $0.06 低于进货成本 $0.061 ——
 *    一旦降级到 plus/pro 档就是每个请求倒贴。
 *    便宜量大的区间由 gpt-5.4-mini 覆盖(兜底毛利仍有 89.8%),不需要 luna。
 * 上游只给了输入/输出/缓存读/缓存写,已原样录入。
 */
import type { ModelSeed } from '../types'

const LONG_CTX = 272_000

export const CODEX_MODELS: ModelSeed[] = [
  {
    id: 'gpt-5.6-terra',
    upstreamId: 'gpt-5.6-terra',
    group: 'codex',
    displayName: 'GPT-5.6 Terra',
    blurb: 'Balanced coding model. The default choice for most agent work.',
    contextWindow: 400_000,
    recommended: true,
    listPrice: { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
    listPriceTiers: [
      { minPromptTokens: LONG_CTX, prices: { input: 4, output: 18, cacheRead: 0.4, cacheWrite: 5 } },
    ],
    upstreamCny: {
      codexBudget: { input: 0.2475, output: 1.485, cacheRead: 0.02475, cacheWrite: 0.309375 },
      codexPlus: { input: 0.4, output: 2.4, cacheRead: 0.04, cacheWrite: 0.5 },
      codexPro: { input: 0.44, output: 2.64, cacheRead: 0.044, cacheWrite: 0.55 },
    },
  },
  {
    id: 'gpt-5.6-sol',
    upstreamId: 'gpt-5.6-sol',
    group: 'codex',
    displayName: 'GPT-5.6 Sol',
    blurb: 'Higher capability tier for harder problems.',
    contextWindow: 400_000,
    listPrice: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
    listPriceTiers: [
      { minPromptTokens: LONG_CTX, prices: { input: 8, output: 30, cacheRead: 0.8, cacheWrite: 10 } },
    ],
    upstreamCny: {
      codexBudget: { input: 0.495, output: 2.97, cacheRead: 0.0495, cacheWrite: 0.61875 },
      codexPlus: { input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1.25 },
      codexPro: { input: 1.1, output: 6.6, cacheRead: 0.11, cacheWrite: 1.375 },
    },
  },
  {
    id: 'gpt-6-astra',
    upstreamId: 'gpt-6-astra',
    group: 'codex',
    displayName: 'GPT-6 Astra',
    blurb: 'Frontier model for the hardest long-horizon work.',
    contextWindow: 400_000,
    // ⚠️ 上游没有「特价分组」档,降级链只有两级
    listPrice: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    listPriceTiers: [
      { minPromptTokens: LONG_CTX, prices: { input: 20, output: 75, cacheRead: 2, cacheWrite: 25 } },
    ],
    upstreamCny: {
      codexPlus: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
      codexPro: { input: 2.2, output: 11, cacheRead: 0.22, cacheWrite: 2.75 },
    },
  },
  {
    id: 'gpt-5.5',
    upstreamId: 'gpt-5.5',
    group: 'codex',
    displayName: 'GPT-5.5',
    blurb: 'Previous generation. Stable fallback.',
    contextWindow: 400_000,
    legacy: true,
    listPrice: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
    listPriceTiers: [
      { minPromptTokens: LONG_CTX, prices: { input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 } },
    ],
    upstreamCny: {
      codexBudget: { input: 0.495, output: 3.96, cacheRead: 0.0495, cacheWrite: 0.0495 },
      codexPlus: { input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1 },
      codexPro: { input: 1.1, output: 6.6, cacheRead: 0.11, cacheWrite: 1.1 },
    },
  },
  {
    id: 'gpt-5.4',
    upstreamId: 'gpt-5.4',
    group: 'codex',
    displayName: 'GPT-5.4',
    blurb: 'Older generation, still widely used.',
    contextWindow: 400_000,
    legacy: true,
    listPrice: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 3.125 },
    listPriceTiers: [
      { minPromptTokens: LONG_CTX, prices: { input: 5, output: 22.5, cacheRead: 0.5, cacheWrite: 6.25 } },
    ],
    upstreamCny: {
      codexBudget: { input: 0.2475, output: 1.485, cacheRead: 0.02475, cacheWrite: 0.02475 },
      codexPlus: { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.5 },
      codexPro: { input: 0.55, output: 3.3, cacheRead: 0.055, cacheWrite: 0.55 },
    },
  },
  {
    id: 'gpt-5.4-mini',
    upstreamId: 'gpt-5.4-mini',
    group: 'codex',
    displayName: 'GPT-5.4 mini',
    blurb: 'Cheapest option. No long-context tier.',
    contextWindow: 400_000,
    legacy: true,
    // 这个模型官方只有一档,没有长上下文分档
    listPrice: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0.94 },
    upstreamCny: {
      codexBudget: { input: 0.0825, output: 0.495, cacheRead: 0.00825, cacheWrite: 0.66 },
      codexPlus: { input: 0.15, output: 0.9, cacheRead: 0.015, cacheWrite: 0.15 },
      codexPro: { input: 0.165, output: 0.99, cacheRead: 0.0165, cacheWrite: 0.165 },
    },
  },
]
