'use server'
import { isValidGroupId } from '@/lib/pricing/groups'
/**
 * 从上游新增模型 —— 价格全部由上游填,你只填展示信息。
 * 这样做的原因见 lib/pricing/import-upstream.ts:手输 12 个价格数字必然出错。
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { models } from '@/lib/db/schema-models'
import { hasOpsAccess } from '@/lib/auth/ops'
import { invalidateModelCache, rowToPricing } from '@/lib/pricing/registry'
import { worstCaseMarginPct } from '@/lib/pricing/calculate'
import { MIN_WORST_MARGIN_PCT } from '@/lib/pricing/loss-guard'
import { fetchImportCandidates, type ImportCandidate } from '@/lib/pricing/import-upstream'
import { logger } from '@/lib/logger'

export type ImportState = { ok: boolean; message: string } | undefined

/** 后台列表页用:上游有货、但我们还没上架的模型 */
export async function listImportable(): Promise<{ candidates: ImportCandidate[]; error?: string }> {
  if (!(await hasOpsAccess())) return { candidates: [], error: '未授权' }
  try {
    const all = await fetchImportCandidates()
    const existing = new Set((await db.select({ u: models.upstreamId }).from(models)).map((r) => r.u))
    return { candidates: all.filter((c) => !existing.has(c.upstreamId)) }
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : '拉取上游失败' }
  }
}

const AddSchema = z.object({
  upstreamId: z.string().trim().min(1),
  modelId: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/, { error: '模型 ID 只能用字母数字和 . _ -' }),
  displayName: z.string().trim().min(1).max(60),
  blurb: z.string().trim().max(200),
  // 同上:分组存在性查库校验,不写死枚举
  productGroup: z.string().min(1).max(32),
  contextWindow: z.coerce.number().int().positive().max(10_000_000),
})

export async function addModelFromUpstream(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '未授权' }

  const parsed = AddSchema.safeParse({
    upstreamId: formData.get('upstreamId'),
    modelId: formData.get('modelId'),
    displayName: formData.get('displayName'),
    blurb: formData.get('blurb') ?? '',
    productGroup: formData.get('productGroup'),
    contextWindow: formData.get('contextWindow') || 200000,
  })
  if (!parsed.success) return { ok: false, message: '填写有误:' + z.prettifyError(parsed.error).slice(0, 140) }
  const d = parsed.data

  // 分组必须真实存在 —— z.enum 换成 z.string 后这一步不能省
  if (!(await isValidGroupId(d.productGroup))) {
    return { ok: false, message: `分组「${d.productGroup}」不存在` }
  }

  try {
    // 价格**只从上游取**,不接受表单传来的价格
    const candidates = await fetchImportCandidates()
    const c = candidates.find((x) => x.upstreamId === d.upstreamId)
    if (!c) return { ok: false, message: `上游已经没有 ${d.upstreamId} 了,可能刚下架` }
    if (!c.listPrice) {
      return {
        ok: false,
        message: `${d.upstreamId} 拿不到官方 list 价(上游没提供,OpenRouter 也查不到)。没有官方价就算不出售价,不能上架。`,
      }
    }

    const row = {
      modelId: d.modelId,
      upstreamId: d.upstreamId,
      productGroup: d.productGroup,
      displayName: d.displayName,
      blurb: d.blurb,
      contextWindow: d.contextWindow,
      // 新增的一律先下架,过了赔本检查你再手动上架 —— 避免错价直接对外
      status: 'disabled',
      sortOrder: 500,
      listInput: c.listPrice.input,
      listOutput: c.listPrice.output,
      listCacheRead: c.listPrice.cacheRead,
      listCacheWrite: c.listPrice.cacheWrite,
      listPriceTiers: c.listPriceTiers ?? null,
      upstreamCny: c.upstreamCny,
      pricesVerifiedAt: new Date(),
    }

    const [inserted] = await db.insert(models).values(row).onConflictDoNothing({ target: models.modelId }).returning()
    if (!inserted) return { ok: false, message: `模型 ID "${d.modelId}" 已存在,换一个` }

    invalidateModelCache()
    revalidatePath('/ops-2f8a/models')
    logger.info('从上游新增模型', { modelId: d.modelId, upstreamId: d.upstreamId })

    const worst = worstCaseMarginPct(rowToPricing(inserted))
    const hint =
      worst === null
        ? ''
        : worst < MIN_WORST_MARGIN_PCT
          ? ` ⚠️ 但兜底毛利只有 ${worst.toFixed(1)}%,低于 ${MIN_WORST_MARGIN_PCT}%,启用时会被护栏拦下。`
          : ` 兜底毛利 ${worst.toFixed(1)}%,可以启用。`
    return { ok: true, message: `已添加 ${d.modelId}(默认下架状态)。${hint}` }
  } catch (e) {
    logger.error('新增模型失败', { detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '添加失败,上游可能不可用。稍后再试。' }
  }
}
