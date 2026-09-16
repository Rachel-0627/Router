'use server'
/**
 * 分组倍率与上架状态 —— 全站最敏感的两个开关。
 *
 * 改倍率会**立刻影响所有用户的账单**,所以:
 *   1. 保存前跑赔本护栏,任何模型兜底毛利跌破阈值就拒绝
 *   2. 改动记日志(谁改的、从多少改到多少)
 *   3. 改完立刻清缓存,不用等 60 秒
 */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { productGroupSettings, models } from '@/lib/db/schema-models'
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { invalidateModelCache, rowToPricing } from '@/lib/pricing/registry'
import { worstCaseMarginPct } from '@/lib/pricing/calculate'
import { MIN_WORST_MARGIN_PCT } from '@/lib/pricing/loss-guard'
import { logger } from '@/lib/logger'
import type { ProductGroupId } from '@/lib/pricing/types'


export type SettingsState = { ok: boolean; message: string } | undefined

const Schema = z.object({
  groupId: z.enum(['claude', 'codex']),
  // 上限 1 = 不允许卖得比官方还贵;下限 0.05 防手滑打成 0.008
  ratio: z.coerce.number().min(0.05, { error: '倍率不能低于 0.05' }).max(1, { error: '倍率不能超过 1(不能比官方还贵)' }),
  status: z.enum(['live', 'pending']),
})

/**
 * 用给定倍率试算:有没有模型会赔本。
 * 返回问题列表,空数组表示安全。
 */
export async function previewRatio(groupId: ProductGroupId, ratio: number) {
  const rows = await db.select().from(models).where(eq(models.productGroup, groupId))
  const out = rows.map((r) => {
    // 模型自己设了倍率的,不受分组倍率影响 —— 预览要如实反映这一点
    const eff = r.ratioOverride ?? ratio
    const m = { ...rowToPricing(r), ratio: eff, groupStatus: 'live' as const }
    return { modelId: r.modelId, status: r.status, worst: worstCaseMarginPct(m), pinned: r.ratioOverride !== null }
  })
  return {
    all: out,
    losers: out.filter((x) => x.status === 'active' && x.worst !== null && x.worst < MIN_WORST_MARGIN_PCT),
  }
}

export async function updateGroupSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '未授权' }
  const parsed = Schema.safeParse({
    groupId: formData.get('groupId'),
    ratio: formData.get('ratio'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error).slice(0, 160) }
  const { groupId, ratio, status } = parsed.data

  // ── 赔本护栏:用新倍率试算,有模型跌破阈值就拒绝 ──
  const { losers } = await previewRatio(groupId, ratio)
  if (losers.length > 0) {
    const detail = losers.map((l) => `${l.modelId} ${l.worst!.toFixed(1)}%`).join('、')
    return {
      ok: false,
      message: `拒绝保存:倍率 ${ratio} 会让这些在售模型的兜底毛利跌破 ${MIN_WORST_MARGIN_PCT}% —— ${detail}。上游一降级就在倒贴。先下架它们,或者把倍率调高。`,
    }
  }

  const [before] = await db.select().from(productGroupSettings).where(eq(productGroupSettings.groupId, groupId))
  await db
    .insert(productGroupSettings)
    .values({ groupId, ratio, status })
    .onConflictDoUpdate({ target: productGroupSettings.groupId, set: { ratio, status, updatedAt: new Date() } })

  invalidateModelCache()
  revalidatePath('/ops-2f8a/pricing')
  revalidatePath('/pricing')
  revalidatePath('/')

  const who = (await getCurrentUser())?.email ?? '?'
  logger.info('分组设置变更', {
    groupId,
    ratioFrom: before?.ratio,
    ratioTo: ratio,
    statusFrom: before?.status,
    statusTo: status,
    by: who,
  })
  return {
    ok: true,
    message: `已保存:${groupId} 倍率 ${ratio}(官方价的 ${Math.round(ratio * 100)}%),${status === 'live' ? '已上架' : '未上架'}`,
  }
}
