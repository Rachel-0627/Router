/**
 * 赔本护栏 —— 判断一个模型在给定倍率下会不会亏钱。
 *
 * 为什么单独一个文件:上架、调价、改分组倍率三处都要用同一套判断。
 * 三处各写一遍必然走样,而走样的后果是"护栏放行了但实际在赔钱"。
 */
import type { ModelRow } from '../db/schema-models'
import { rowToPricing } from './registry'
import { worstCaseMarginPct, grossMarginPct } from './calculate'

/** 兜底档毛利低于这个数就不许上架(百分比) */
export const MIN_WORST_MARGIN_PCT = 5

/** 按运行时的同一套规则算出这个模型实际用的倍率 */
export function effectiveRatio(row: ModelRow, groupRatio: number | undefined, fallback: number): number {
  return row.ratioOverride ?? groupRatio ?? fallback
}

/**
 * 检查。通过返回 null,不通过返回给人看的拒绝理由。
 * @param groupRatio 所属分组的倍率;模型自己有覆盖值时优先用覆盖值
 */
export function lossCheck(row: ModelRow, groupRatio?: number): string | null {
  const base = rowToPricing(row)
  const m = { ...base, ratio: effectiveRatio(row, groupRatio, base.ratio) }

  const worst = worstCaseMarginPct(m)
  const primary = grossMarginPct(m)
  if (worst === null) return `${m.id}:没有任何上游分组有价格,无法计算成本`
  if (worst < MIN_WORST_MARGIN_PCT) {
    return (
      `拒绝:${m.id} 在倍率 ${m.ratio} 下,降级到兜底分组时毛利只有 ${worst.toFixed(1)}%` +
      `(主力分组 ${primary?.toFixed(1) ?? '?'}%)。上游一旦降级每个请求都在倒贴。` +
      `要么提高倍率,要么只保留便宜的上游档位。`
    )
  }
  return null
}
