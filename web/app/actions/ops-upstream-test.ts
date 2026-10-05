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
  //
  // 试**多个**模型而不是只试一个:只试一个时,"这把 key 没权限"和
  // "这个模型名写错了"会给出一模一样的 503,根本分不开。
  // 多试几个,只要有一个通,就说明 key 是好的、问题出在那个模型名上。
  //
  // 填了自定义模型名就只试它 —— 用来验证上游有没有某个我们还没上架的型号,
  // 省得为了试一下先往目录里加一条假数据。
  const custom = (form.get('model') ?? '').toString().trim()

  let candidates: { id: string; upstreamId: string }[]
  if (custom) {
    if (custom.length > 100 || /\s/.test(custom)) {
      return { ok: false, message: '模型名不合法(太长或含空格)。' }
    }
    candidates = [{ id: custom, upstreamId: custom }]
  } else {
    try {
      const all = await getModels()
      candidates = all
        .filter((m) => m.group === group)
        .sort((a, b) => a.listPrice.input - b.listPrice.input)
        .slice(0, 3)
        .map((m) => ({ id: m.id, upstreamId: m.upstreamId }))
      if (candidates.length === 0) {
        return { ok: false, message: `${group} 组还没有在售模型,先去模型目录上架一个。` }
      }
    } catch {
      return { ok: false, message: '读不到模型目录,稍后重试。' }
    }
  }

  // Claude 走 Anthropic 格式,GPT 走 OpenAI 格式 —— 发错格式上游一样会报错
  const isClaude = group === 'claude'
  const path = isClaude ? '/v1/messages' : '/v1/chat/completions'
  const url = `${base.replace(/\/$/, '')}${path}`

  const results: { model: string; status: number | null; detail: string }[] = []

  for (const c of candidates) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(isClaude ? { 'anthropic-version': '2023-06-01' } : {}),
        },
        // 最小请求:1 个 token,花掉的钱可以忽略
        body: JSON.stringify({ model: c.upstreamId, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(20_000),
      })

      if (res.ok) {
        const others = results.length
        logger.info('上游连通性测试通过', { group, model: c.upstreamId, failedBefore: others })
        return {
          ok: true,
          message: custom
            ? `通了。上游有「${c.upstreamId}」,而我们目录里还没上架它。`
            : others === 0
              ? `通了。上游接受了 ${c.upstreamId}。`
              : `通了(${c.upstreamId})。但前 ${others} 个模型没过 —— key 是好的,是那几个模型名或渠道有问题:${results.map((r) => r.model).join('、')}`,
        }
      }

      const raw = await res.text().catch(() => '')
      results.push({ model: c.upstreamId, status: res.status, detail: raw.replace(/\s+/g, ' ').slice(0, 120) })

      // key 本身不对就没必要再试别的了,结论已经确定
      if (res.status === 401 || res.status === 403) break
    } catch (e) {
      results.push({ model: c.upstreamId, status: null, detail: e instanceof Error ? e.message : String(e) })
    }
  }

  logger.error('上游连通性测试:全部候选都未通过', { group, results })

  const first = results[0]
  const allAuth = results.every((r) => r.status === 401 || r.status === 403)
  const hint = allAuth
    ? 'key 不对,或这把 key 没有该分组的权限。'
    : custom
      ? `上游在这把 key 的分组里没有「${custom}」这个模型。可能是名字拼法不同,也可能该分组确实不含它。`
      : `这 ${results.length} 个模型在这把 key 的分组里都没有可用渠道。要么这把 key 绑错了分组,要么上游对这些模型名的叫法和我们不一样。`

  const lines = results.map((r) => `${r.model}=${r.status ?? '连不上'}`).join(' · ')
  return {
    ok: false,
    message: `都没通。${hint} 试过:${lines}。上游原话:${first?.detail ?? ''}`,
  }
}
