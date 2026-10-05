'use server'
import { isValidGroupId } from '@/lib/pricing/groups'
/**
 * 模型目录管理(运营后台专用)。
 *
 * ⚠️ 两条硬规则,任何改动都绕不过:
 *   1. **启用前必须过赔本护栏** —— 降级到最贵兜底档时毛利低于阈值就拒绝。
 *      拦下 gpt-5.6-luna 的就是这条。
 *   2. **有用量记录的模型不能硬删** —— 只能下架。否则历史账单查不到模型名。
 */
import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { models, productGroupSettings } from '@/lib/db/schema-models'
import { usageDaily } from '@/lib/db/schema'
import { hasOpsAccess } from '@/lib/auth/ops'
import { invalidateModelCache } from '@/lib/pricing/registry'
import { lossCheck } from '@/lib/pricing/loss-guard'
import { fetchImportCandidates } from '@/lib/pricing/import-upstream'
import { logger } from '@/lib/logger'

export type ModelActionState = { ok: boolean; message: string } | undefined

async function guard(): Promise<boolean> {
  return hasOpsAccess()
}

const IdSchema = z.uuid()

/** 启用 / 下架 */
export async function setModelStatus(formData: FormData): Promise<ModelActionState> {
  if (!(await guard())) return { ok: false, message: '未授权' }
  const id = String(formData.get('id') ?? '')
  const next = formData.get('next') === 'active' ? 'active' : 'disabled'
  if (!IdSchema.safeParse(id).success) return { ok: false, message: '参数无效' }

  const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1)
  if (!row) return { ok: false, message: '模型不存在' }

  if (next === 'active') {
    const [gs] = await db
      .select()
      .from(productGroupSettings)
      .where(eq(productGroupSettings.groupId, row.productGroup))
      .limit(1)
    const reason = lossCheck(row, gs?.ratio)
    if (reason) {
      logger.warn('赔本护栏拦截了启用操作', { modelId: row.modelId })
      return { ok: false, message: reason }
    }
  }
  await db.update(models).set({ status: next, updatedAt: new Date() }).where(eq(models.id, id))
  invalidateModelCache()
  revalidatePath('/ops-2f8a/models')
  logger.info('模型状态变更', { modelId: row.modelId, status: next })
  return { ok: true, message: `${row.modelId} 已${next === 'active' ? '上架' : '下架'}` }
}

/** 删除。有用量记录的只能下架,不能删。 */
export async function deleteModel(formData: FormData): Promise<ModelActionState> {
  if (!(await guard())) return { ok: false, message: '未授权' }
  const id = String(formData.get('id') ?? '')
  if (!IdSchema.safeParse(id).success) return { ok: false, message: '参数无效' }

  const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1)
  if (!row) return { ok: false, message: '模型不存在' }

  const [used] = await db
    .select({ n: sql<string>`count(*)` })
    .from(usageDaily)
    .where(eq(usageDaily.model, row.modelId))
  if (Number(used?.n ?? 0) > 0) {
    return {
      ok: false,
      message: `${row.modelId} 有历史用量记录,不能删除(删了账单查不到模型名)。请改为下架。`,
    }
  }
  await db.delete(models).where(eq(models.id, id))
  invalidateModelCache()
  revalidatePath('/ops-2f8a/models')
  logger.info('模型已删除', { modelId: row.modelId })
  return { ok: true, message: `${row.modelId} 已删除` }
}

/** 改元数据(不含价格 —— 价格只能从上游同步,防手滑) */
const MetaSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  blurb: z.string().trim().max(200),
  // 同上:分组存在性查库校验,不写死枚举
  productGroup: z.string().min(1).max(32),
  contextWindow: z.coerce.number().int().positive().max(10_000_000),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  recommended: z.coerce.boolean(),
  legacy: z.coerce.boolean(),
})

export async function updateModelMeta(formData: FormData): Promise<ModelActionState> {
  if (!(await guard())) return { ok: false, message: '未授权' }
  const id = String(formData.get('id') ?? '')
  if (!IdSchema.safeParse(id).success) return { ok: false, message: '参数无效' }

  const parsed = MetaSchema.safeParse({
    displayName: formData.get('displayName'),
    blurb: formData.get('blurb') ?? '',
    productGroup: formData.get('productGroup'),
    contextWindow: formData.get('contextWindow'),
    sortOrder: formData.get('sortOrder'),
    recommended: formData.get('recommended') === 'on',
    legacy: formData.get('legacy') === 'on',
  })
  if (!parsed.success) return { ok: false, message: '填写有误:' + z.prettifyError(parsed.error).slice(0, 120) }

  // 分组必须真实存在 —— z.enum 换成 z.string 后这一步不能省
  if (!(await isValidGroupId(parsed.data.productGroup))) {
    return { ok: false, message: `分组「${parsed.data.productGroup}」不存在` }
  }

  await db.update(models).set({ ...parsed.data, updatedAt: new Date() }).where(eq(models.id, id))
  invalidateModelCache()
  revalidatePath('/ops-2f8a/models')
  return { ok: true, message: '已保存' }
}

/** 从上游同步价格(只更新已有模型的价格,不新增) */
export async function syncPricesFromUpstream(): Promise<ModelActionState> {
  if (!(await guard())) return { ok: false, message: '未授权' }
  try {
    const candidates = await fetchImportCandidates()
    const byId = new Map(candidates.map((c) => [c.upstreamId, c]))
    const rows = await db.select().from(models)
    let n = 0
    for (const r of rows) {
      const c = byId.get(r.upstreamId)
      if (!c) continue
      await db
        .update(models)
        .set({
          upstreamCny: c.upstreamCny,
          ...(c.listPrice
            ? {
                listInput: c.listPrice.input,
                listOutput: c.listPrice.output,
                listCacheRead: c.listPrice.cacheRead,
                listCacheWrite: c.listPrice.cacheWrite,
                listPriceTiers: c.listPriceTiers ?? null,
              }
            : {}),
          pricesVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(models.id, r.id))
      n++
    }
    invalidateModelCache()
    revalidatePath('/ops-2f8a/models')
    logger.info('已从上游同步价格', { count: n })
    return { ok: true, message: `已同步 ${n} 个模型的价格(上游共 ${candidates.length} 个可进货)` }
  } catch (e) {
    logger.error('同步上游价格失败', { detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '同步失败,上游可能不可用。稍后再试。' }
  }
}

/**
 * 单模型调价:设置或清除倍率覆盖。
 * 空值 = 跟分组倍率走。同样过赔本护栏。
 */
export async function setModelRatio(formData: FormData): Promise<ModelActionState> {
  if (!(await guard())) return { ok: false, message: '未授权' }
  const id = String(formData.get('id') ?? '')
  if (!IdSchema.safeParse(id).success) return { ok: false, message: '参数无效' }

  const raw = String(formData.get('ratio') ?? '').trim()
  let override: number | null = null
  if (raw !== '') {
    const p = z.coerce.number().min(0.05).max(1).safeParse(raw)
    if (!p.success) return { ok: false, message: '倍率要在 0.05 到 1 之间(1 = 官方原价)' }
    override = p.data
  }

  const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1)
  if (!row) return { ok: false, message: '模型不存在' }

  // 只有在售的才卡护栏 —— 下架的模型改价不影响任何人
  if (row.status === 'active') {
    const reason = lossCheck({ ...row, ratioOverride: override })
    if (reason) return { ok: false, message: reason }
  }

  await db.update(models).set({ ratioOverride: override, updatedAt: new Date() }).where(eq(models.id, id))
  invalidateModelCache()
  revalidatePath('/ops-2f8a/models')
  revalidatePath('/pricing')
  logger.info('单模型调价', { modelId: row.modelId, ratioOverride: override })
  return {
    ok: true,
    message: override === null ? `${row.modelId} 已改回跟随分组倍率` : `${row.modelId} 倍率设为 ${override}(官方价的 ${Math.round(override * 100)}%)`,
  }
}
