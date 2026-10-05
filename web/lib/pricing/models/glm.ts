/**
 * GLM 产品线的模型(智谱 / Z.ai)。
 *
 * ⚠️ **这一组尚未上架** —— 注入行为和实际可用性都没验证过,先把价格备好。
 *
 * 官方 list 价用的是 **Z.ai 国际站标准 API 公开价(美元)**,不是智谱国内的
 * 人民币价。上游价格页自己就是按这个口径对比的(核对日期 2026-09-12),
 * 我们跟它保持一致 —— 否则两边倍率对不上,没法核对价格漂移。
 * 因此**不需要做汇率换算**,list 价直接就是美元。
 *
 * 进货价四档(便宜→贵):免费模型 / 默认分组 / 精选模型 / 公司分组。
 * 不是每个模型四档都有,fallbackChain 会自动跳过没有的档。
 *
 * ⚠️ **缓存写入价上游没给**。TokenPrices 又要求这个字段,这里一律取与输入价
 *    相同 —— 和 import-upstream.ts 的 `cache_write_price ?? input_price` 同一口径。
 *    真实值拿到前,这是个**保守假设**:写入按输入价算,不会低估成本。
 *
 * ⚠️ **glm-4-flash-250414 故意不录入**:上游标注「官方倍率待核对」,
 *    没有官方价就没法定售价(我们的售价 = 官方价 × 倍率)。而且它上游是 ¥0,
 *    白送的东西卖不出钱,还容易招刷量。等上游补了官方价再说。
 *
 * 数据来源:上游价格页截图,2026-10-05 录入。
 */
import type { ModelSeed } from '../types'

export const GLM_MODELS: ModelSeed[] = [
  {
    id: 'glm-5.3',
    upstreamId: 'glm-5.3',
    group: 'glm',
    displayName: 'GLM-5.3',
    blurb: 'Zhipu flagship. Long context, strong on code, very low cost.',
    contextWindow: 1_000_000,
    recommended: true,
    listPrice: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 },
    upstreamCny: {
      default: { input: 0.342, output: 1.2, cacheRead: 0.063612, cacheWrite: 0.342 },
      glmFeatured: { input: 2.8215, output: 9.9, cacheRead: 0.524799, cacheWrite: 2.8215 },
      glmCompany: { input: 5.2, output: 18.2, cacheRead: 1.3, cacheWrite: 5.2 },
    },
  },
  {
    id: 'glm-5.3-flash',
    upstreamId: 'glm-5.3-flash',
    group: 'glm',
    displayName: 'GLM-5.3 Flash',
    blurb: 'Fast and cheap. For high-volume, latency-sensitive calls.',
    contextWindow: 1_000_000,
    listPrice: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0.15 },
    upstreamCny: {
      glmFeatured: { input: 0.27499725, output: 0.96250275, cacheRead: 0.039534, cacheWrite: 0.27499725 },
      glmCompany: { input: 0.44, output: 1.54, cacheRead: 0.1265, cacheWrite: 0.44 },
    },
  },
  {
    id: 'glm-5.2',
    upstreamId: 'glm-5.2',
    group: 'glm',
    displayName: 'GLM-5.2',
    blurb: 'Previous flagship. Same pricing as 5.3, with a free upstream tier.',
    contextWindow: 1_000_000,
    listPrice: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 },
    upstreamCny: {
      glmFree: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      default: { input: 0.171, output: 0.6, cacheRead: 0.031806, cacheWrite: 0.171 },
      glmFeatured: { input: 2.8215, output: 9.9, cacheRead: 0.524799, cacheWrite: 2.8215 },
    },
  },
  {
    id: 'glm-5.1',
    upstreamId: 'glm-5.1',
    group: 'glm',
    displayName: 'GLM-5.1',
    blurb: 'Older generation, still capable. Cheapest paid tier upstream.',
    contextWindow: 1_000_000,
    legacy: true,
    listPrice: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 },
    upstreamCny: {
      default: { input: 0.171, output: 0.6, cacheRead: 0.031806, cacheWrite: 0.171 },
      glmFeatured: { input: 2.8215, output: 9.9, cacheRead: 0.524799, cacheWrite: 2.8215 },
    },
  },
  {
    id: 'glm-5',
    upstreamId: 'glm-5',
    group: 'glm',
    displayName: 'GLM-5',
    blurb: 'First of the GLM-5 line. Lower list price than 5.1 and up.',
    contextWindow: 1_000_000,
    legacy: true,
    listPrice: { input: 1, output: 3.2, cacheRead: 0.2, cacheWrite: 1 },
    upstreamCny: {
      glmFeatured: { input: 2.8215, output: 9.9, cacheRead: 0.524799, cacheWrite: 2.8215 },
    },
  },
]
