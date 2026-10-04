'use server'
/**
 * 上游连通性实测 —— 用当前配置真发一个最小请求(max_tokens=1)。
 * 填完当场知道通不通,不用等真实用户来踩雷。
 *
 * 单独一个文件:ops-secrets.ts 加上它会超 200 行,而且这里的关注点
 * (上游协议细节)和那边的(密钥存取)本来就不是一回事。
 */
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { getSecret } from '@/lib/secrets/store'
import { type SlotName } from '@/lib/secrets/slots'
import { getModels } from '@/lib/pricing/registry'
import { logger } from '@/lib/logger'
import type { SecretState } from './ops-secrets'

async function requireAdmin(): Promise<void> {
  const [user, ok] = await Promise.all([getCurrentUser(), hasOpsAccess()])
  if (!user || !ok) throw new Error('需要管理员权限')
}

/**
 * 测试上游连通性 —— 用当前配置真发一个最小请求。
 * 填完当场知道通不通,不用等真实用户来踩雷。
 */
export async function testUpstream(_prev: SecretState, form: FormData): Promise<SecretState> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }

  const group = (form.get('group') ?? 'claude').toString() === 'codex' ? 'codex' : 'claude'
  const base = await getSecret('NEWAPI_BASE_URL')
  if (!base) return { ok: false, message: '先填上游地址' }

  const keySlot = group === 'codex' ? 'NEWAPI_SERVICE_KEY_CODEX' : 'NEWAPI_SERVICE_KEY_CLAUDE'
  const key = await getSecret(keySlot as SlotName)
  if (!key) return { ok: false, message: `先填${group === 'codex' ? ' Codex ' : ' Claude '}组的 key` }

  // ⚠️ 必须用 upstreamId,不是我们对外的 id —— 两者并不总是相同
  //    (如 claude-haiku-4-5 对应上游 claude-haiku-4-5-20251001)。
  //    发错名字上游会回 503「无可用渠道」,看起来像上游故障,其实是我们填错了。
  let model: string
  try {
    const all = await getModels()
    const pick = all.filter((m) => m.group === group).sort((a, b) => a.listPrice.input - b.listPrice.input)[0]
    if (!pick) return { ok: false, message: `${group} 组还没有在售模型,先去模型目录上架一个。` }
    model = pick.upstreamId
  } catch {
    return { ok: false, message: '读不到模型目录,稍后重试。' }
  }

  // Claude 走 Anthropic 格式,GPT 走 OpenAI 格式 —— 发错格式上游一样会报错
  const isClaude = group === 'claude'
  const path = isClaude ? '/v1/messages' : '/v1/chat/completions'
  // 两种格式在这个最小请求上恰好同形,所以 body 只有一份;
  // 差别在路径和 anthropic-version 头上。
  const body = { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(isClaude ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      // 最小请求:1 个 token,花掉的钱可以忽略
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })

    if (res.ok) return { ok: true, message: `通了。上游接受了 ${model}。` }

    // ⚠️ 把上游**原话**带出来。只说"上游故障"会把真正的原因盖掉 ——
    //    503 在 new-api 系里最常见的含义其实是"这个模型没有可用渠道",
    //    那是配置问题,不是故障,但不看原文根本分不出来。
    const raw = await res.text().catch(() => '')
    const detail = raw.replace(/\s+/g, ' ').slice(0, 200)
    const status = res.status

    const hint =
      status === 401 || status === 403
        ? 'key 不对,或这把 key 没有该分组的权限。'
        : status === 404
          ? '地址填错了,或上游没有这个模型。'
          : status === 429
            ? '上游限流,过会儿再试。'
            : status >= 500
              ? `上游没接住 ${model}。常见原因是这把 key 所在的分组里没有该模型的渠道 —— 不一定是故障。`
              : ''

    logger.error('上游连通性测试未通过', { group, model, status, detail })
    return { ok: false, message: `上游返回 ${status}。${hint}${detail ? ` 上游原话:${detail}` : ''}` }
  } catch (e) {
    logger.error('上游连通性测试失败', { group, model, detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '连不上上游 —— 检查地址拼写,或上游正好不可用。' }
  }
}
