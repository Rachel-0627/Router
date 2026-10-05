'use server'
/**
 * 上游连通性实测 —— 任选一把 key、任填一个模型名、任选协议,真发一个
 * 最小请求(max_tokens=1)看上游怎么回。
 *
 * ⚠️ 故意**不绑产品分组**。绑死分组时,"这把 key 没权限"和"这个模型名
 *    写错了"会给出一模一样的 503,根本分不开;而且想摸清上游到底有哪些
 *    模型时,还得先往目录里塞一条假数据才能试。解耦之后这两件事都解决了。
 */
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { getSecret } from '@/lib/secrets/store'
import { logger } from '@/lib/logger'
import type { SecretState } from './ops-secrets'

async function requireAdmin(): Promise<void> {
  const [user, ok] = await Promise.all([getCurrentUser(), hasOpsAccess()])
  if (!user || !ok) throw new Error('需要管理员权限')
}

/** 两种上游协议。发错格式上游一样会报错,所以让人显式选。 */
const PROTOCOLS = {
  anthropic: '/v1/messages',
  openai: '/v1/chat/completions',
} as const
type Protocol = keyof typeof PROTOCOLS

export async function testUpstream(_prev: SecretState, form: FormData): Promise<SecretState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }

  const keySlot = (form.get('keySlot') ?? '').toString().trim()
  const model = (form.get('model') ?? '').toString().trim()
  const protocol = (form.get('protocol') ?? 'anthropic').toString() as Protocol

  if (!keySlot) return { ok: false, message: '请选一把 key。' }
  if (!model) return { ok: false, message: '请填一个模型名。' }
  if (model.length > 100 || /\s/.test(model)) return { ok: false, message: '模型名不合法(太长或含空格)。' }
  if (!(protocol in PROTOCOLS)) return { ok: false, message: '未知协议。' }

  const base = await getSecret('NEWAPI_BASE_URL')
  if (!base) return { ok: false, message: '先填上游地址。' }
  const key = await getSecret(keySlot)
  if (!key) return { ok: false, message: `「${keySlot}」还没填值。` }

  const isAnthropic = protocol === 'anthropic'
  const url = `${base.replace(/\/$/, '')}${PROTOCOLS[protocol]}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(isAnthropic ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      // 最小请求:1 个 token,花掉的钱可以忽略
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      signal: AbortSignal.timeout(20_000),
    })

    if (res.ok) {
      logger.info('上游连通性测试通过', { keySlot, model, protocol })
      return { ok: true, message: `通了。这把 key 能调 ${model}。` }
    }

    // ⚠️ 把上游**原话**带出来。只说"上游故障"会把真正的原因盖掉 ——
    //    503 在 new-api 系里最常见的含义其实是"这个模型没有可用渠道",
    //    那是配置问题不是故障,但不看原文根本分不出来。
    const raw = await res.text().catch(() => '')
    const detail = raw.replace(/\s+/g, ' ').slice(0, 200)
    const s = res.status
    const hint =
      s === 401 || s === 403
        ? '这把 key 不对,或已被上游禁用。'
        : s === 404
          ? '上游没有这个路径 —— 多半是地址填错了,或这个协议走不通。'
          : s === 429
            ? '上游限流,过会儿再试。'
            : s >= 500
              ? `上游没接住 ${model}。最常见的原因是这把 key 所属的分组里没有该模型的渠道,其次是模型名拼法和上游不一致。`
              : ''

    logger.error('上游连通性测试未通过', { keySlot, model, protocol, status: s, detail })
    return { ok: false, message: `上游返回 ${s}。${hint} 上游原话:${detail}` }
  } catch (e) {
    logger.error('上游连通性测试失败', { keySlot, model, detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '连不上上游 —— 检查地址拼写,或上游正好不可用。' }
  }
}

/**
 * 拉取上游可用模型清单 —— 走标准的 /v1/models,用 sk- key 就能调。
 *
 * 和「填模型名硬试」互补:这个直接告诉你**这把 key 到底能调哪些模型**,
 * 不用一个个猜名字。上游控制台的 /api/pricing 要账号会话令牌,
 * 我们只有 API key,拿不到;但模型名单这个标准端点是认 API key 的。
 *
 * ⚠️ 它只给名字,**不给进货价**。价格还得去上游价格页看。
 */
export async function listUpstreamModels(
  _prev: SecretState,
  form: FormData,
): Promise<SecretState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }

  const keySlot = (form.get('keySlot') ?? '').toString().trim()
  const filter = (form.get('filter') ?? '').toString().trim().toLowerCase()
  if (!keySlot) return { ok: false, message: '请选一把 key。' }

  const base = await getSecret('NEWAPI_BASE_URL')
  if (!base) return { ok: false, message: '先填上游地址。' }
  const key = await getSecret(keySlot)
  if (!key) return { ok: false, message: `「${keySlot}」还没填值。` }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const raw = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
      return { ok: false, message: `上游返回 ${res.status}。${raw}` }
    }

    const body = (await res.json()) as { data?: { id?: unknown }[] }
    let ids = (body.data ?? [])
      .map((m) => (typeof m.id === 'string' ? m.id : ''))
      .filter(Boolean)
      .sort()
    const total = ids.length
    if (filter) ids = ids.filter((id) => id.toLowerCase().includes(filter))

    logger.info('拉取上游模型清单', { keySlot, total, matched: ids.length, filter })
    if (ids.length === 0) {
      return { ok: false, message: `这把 key 能调 ${total} 个模型,但没有匹配「${filter}」的。` }
    }
    return {
      ok: true,
      message: `这把 key 能调 ${total} 个模型${filter ? `,匹配「${filter}」的 ${ids.length} 个` : ''}:${ids.join('  ')}`,
    }
  } catch (e) {
    logger.error('拉取上游模型清单失败', { keySlot, detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '连不上上游 —— 检查地址,或上游正好不可用。' }
  }
}
