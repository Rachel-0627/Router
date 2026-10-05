'use server'
/**
 * 产品分组的增删改 —— 新建一条就是新开一条产品线。
 *
 * 安全与数据完整性约定:
 *   - 仅管理员
 *   - groupId 建后不可改:已经发出去的 API key 绑着它,改了那些 key 就废了
 *   - 删除前必须确认没有模型、没有 key 还挂在上面,否则会留下孤儿数据
 *   - 倍率走和改价同一套赔本护栏
 */
import { revalidatePath } from 'next/cache'
import { eq, and, count } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { productGroupSettings, models } from '@/lib/db/schema-models'
import { apiKeys } from '@/lib/db/schema'
import { hasOpsAccess } from '@/lib/auth/ops'
import { invalidateGroupCache, getGroup } from '@/lib/pricing/groups'
import { invalidateModelCache } from '@/lib/pricing/registry'
import { invalidateSecretCache } from '@/lib/secrets/store'
import { isValidUpstreamId } from '@/lib/upstreams'
import { defaultSlotForGroup } from '@/lib/secrets/slots'
import { logger } from '@/lib/logger'

export type GroupState = { ok: boolean; message: string } | undefined

/** 标识只允许小写字母数字和连字符 —— 它要用来拼环境变量名和 URL */
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/

const Schema = z.object({
  groupId: z.string().regex(ID_RE, { error: '标识只能用小写字母、数字、连字符,且以字母开头' }),
  displayName: z.string().trim().min(1, { error: '显示名不能为空' }).max(40),
  blurb: z.string().trim().max(200),
  ratio: z.coerce.number().min(0.05, { error: '倍率不能低于 0.05' }).max(1, { error: '倍率不能超过 1(不能比官方还贵)' }),
  status: z.enum(['live', 'pending']),
  protocol: z.enum(['anthropic', 'openai']),
  upstreamId: z.string().trim().max(32),
  secretSlot: z.string().trim().max(64),
  sortOrder: z.coerce.number().min(0).max(9999),
})

function refresh() {
  invalidateGroupCache()
  invalidateModelCache()
  invalidateSecretCache()   // 槽位名单是从分组推出来的,也要清
  for (const p of ['/ops-2f8a/groups', '/ops-2f8a/pricing', '/ops-2f8a/credentials', '/pricing', '/dashboard/keys']) {
    revalidatePath(p)
  }
}

export async function saveGroup(_prev: GroupState, form: FormData): Promise<GroupState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '需要管理员权限' }

  const parsed = Schema.safeParse({
    groupId: (form.get('groupId') ?? '').toString().trim().toLowerCase(),
    displayName: form.get('displayName'),
    blurb: form.get('blurb') ?? '',
    ratio: form.get('ratio'),
    status: form.get('status'),
    protocol: form.get('protocol'),
    upstreamId: (form.get('upstreamId') ?? '').toString().trim(),
    secretSlot: (form.get('secretSlot') ?? '').toString().trim(),
    sortOrder: form.get('sortOrder') ?? 0,
  })
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error).slice(0, 160) }

  const d = parsed.data
  // 没填就按分组标识自动起名,省得用户还要想一个
  const secretSlot = d.secretSlot || defaultSlotForGroup(d.groupId)

  // 挂了上游就必须是真实存在的 —— 指向不存在的上游会让网关找不到地址
  if (d.upstreamId && !(await isValidUpstreamId(d.upstreamId))) {
    return { ok: false, message: `上游「${d.upstreamId}」不存在` }
  }

  const existed = await getGroup(d.groupId)
  const row = {
    groupId: d.groupId,
    displayName: d.displayName,
    blurb: d.blurb,
    ratio: d.ratio,
    status: d.status,
    protocol: d.protocol,
    secretSlot,
    upstreamId: d.upstreamId,
    sortOrder: d.sortOrder,
    updatedAt: new Date(),
  }

  await db
    .insert(productGroupSettings)
    .values(row)
    .onConflictDoUpdate({ target: productGroupSettings.groupId, set: row })

  refresh()
  logger.info(existed ? '分组已更新' : '新建分组', { groupId: d.groupId, status: d.status })
  return {
    ok: true,
    message: existed
      ? '已保存,立刻生效。'
      : `分组「${d.displayName}」已创建。接下来去密钥配置页填 ${secretSlot},再去模型目录给它加模型。`,
  }
}

/**
 * 删除分组。**先查有没有东西还挂在上面** ——
 * 直接删会留下指向不存在分组的模型和 key,那些 key 会在网关处永远 403,
 * 而且用户看不懂为什么。
 */
export async function deleteGroup(_prev: GroupState, form: FormData): Promise<GroupState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '需要管理员权限' }
  const groupId = (form.get('groupId') ?? '').toString().trim()
  if (!groupId) return { ok: false, message: '参数无效' }

  const [[m], [k]] = await Promise.all([
    db.select({ n: count() }).from(models).where(eq(models.productGroup, groupId)),
    db.select({ n: count() }).from(apiKeys).where(and(eq(apiKeys.productGroup, groupId), eq(apiKeys.status, 'active'))),
  ])
  if (m.n > 0 || k.n > 0) {
    return {
      ok: false,
      message: `不能删:还有 ${m.n} 个模型、${k.n} 把有效 key 挂在这个分组上。先把模型挪走或下架、让用户换 key,再回来删。`,
    }
  }

  await db.delete(productGroupSettings).where(eq(productGroupSettings.groupId, groupId))
  refresh()
  logger.info('分组已删除', { groupId })
  return { ok: true, message: `分组「${groupId}」已删除。` }
}
