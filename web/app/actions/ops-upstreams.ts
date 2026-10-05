'use server'
/**
 * 上游供应商的增删改。
 *
 * 数据完整性约定:
 *   - 标识建后不可改:产品分组指着它
 *   - 删除前确认没有分组还挂着,否则那些分组会找不到地址,网关 503
 */
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { upstreams } from '@/lib/db/schema-upstreams'
import { productGroupSettings } from '@/lib/db/schema-models'
import { hasOpsAccess } from '@/lib/auth/ops'
import { invalidateUpstreamCache, getUpstream, AUTH_STYLES } from '@/lib/upstreams'
import { invalidateGroupCache } from '@/lib/pricing/groups'
import { logger } from '@/lib/logger'

export type UpstreamState = { ok: boolean; message: string } | undefined

const ID_RE = /^[a-z][a-z0-9-]{1,30}$/

const Schema = z.object({
  id: z.string().regex(ID_RE, { error: '标识只能用小写字母、数字、连字符,且以字母开头' }),
  displayName: z.string().trim().min(1, { error: '名字不能为空' }).max(40),
  // 只要根地址,不带路径和末尾斜杠 —— 转发时要在后面拼 /v1/messages
  baseUrl: z
    .string()
    .trim()
    .regex(/^https?:\/\/[^\s/]+$/i, { error: '地址要形如 https://example.com,不带路径和末尾斜杠' }),
  authStyle: z.enum(AUTH_STYLES),
  note: z.string().trim().max(200),
  sortOrder: z.coerce.number().min(0).max(9999),
})

function refresh() {
  invalidateUpstreamCache()
  invalidateGroupCache()
  for (const p of ['/ops-2f8a/credentials', '/ops-2f8a/groups']) revalidatePath(p)
}

export async function saveUpstream(_prev: UpstreamState, form: FormData): Promise<UpstreamState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '需要管理员权限' }

  const parsed = Schema.safeParse({
    id: (form.get('id') ?? '').toString().trim().toLowerCase(),
    displayName: form.get('displayName'),
    baseUrl: form.get('baseUrl'),
    authStyle: form.get('authStyle'),
    note: form.get('note') ?? '',
    sortOrder: form.get('sortOrder') ?? 0,
  })
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error).slice(0, 160) }

  const d = parsed.data
  const existed = await getUpstream(d.id)
  const row = { ...d, updatedAt: new Date() }

  await db.insert(upstreams).values(row).onConflictDoUpdate({ target: upstreams.id, set: row })
  refresh()
  logger.info(existed ? '上游已更新' : '新建上游', { id: d.id, baseUrl: d.baseUrl, authStyle: d.authStyle })
  return {
    ok: true,
    message: existed
      ? '已保存,立刻生效。'
      : `上游「${d.displayName}」已创建。去分组管理把产品线挂到它上面,再回来填 key。`,
  }
}

export async function deleteUpstream(_prev: UpstreamState, form: FormData): Promise<UpstreamState> {
  if (!(await hasOpsAccess())) return { ok: false, message: '需要管理员权限' }
  const id = (form.get('id') ?? '').toString().trim()
  if (!id) return { ok: false, message: '参数无效' }

  // 还有分组挂着就不能删 —— 删了那些分组找不到地址,所有请求 503
  const using = await db
    .select({ g: productGroupSettings.groupId })
    .from(productGroupSettings)
    .where(eq(productGroupSettings.upstreamId, id))
  if (using.length > 0) {
    return {
      ok: false,
      message: `不能删:还有 ${using.length} 条产品线挂在上面(${using.map((u) => u.g).join('、')})。先把它们改挂到别的上游。`,
    }
  }

  await db.delete(upstreams).where(eq(upstreams.id, id))
  refresh()
  logger.info('上游已删除', { id })
  return { ok: true, message: `上游「${id}」已删除。` }
}
