/**
 * 从上游导入模型 —— 后台「同步」按钮背后的逻辑。
 *
 * 为什么必须做这个而不是让人手打价格:
 *   价格字段有 4 项 × 3 个分组 = 12 个数字,还有长上下文分档。
 *   手输必然出错,而**价格错了就是直接赔钱**。
 *   上游 /api/pricing 是权威数据,导进来不会错。
 *
 * 官方 list 价两个来源:
 *   GPT 系列  上游自带 official_pricing 字段
 *   Claude 系 上游不提供,用 OpenRouter 的 Anthropic 直连报价
 */
import type { PriceTier, TokenPrices, UpstreamGroup } from './types'
import { UPSTREAM_GROUPS, UPSTREAM_GROUP_LABEL } from './types'

const UPSTREAM_URL = 'https://zexitongxue.com/api/pricing'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models'
const TIMEOUT_MS = 20_000

export type ImportCandidate = {
  upstreamId: string
  vendor: string
  description: string
  /** 上游有货的分组(键是我们的 UpstreamGroup) */
  upstreamCny: Partial<Record<UpstreamGroup, TokenPrices>>
  /** 上游出现过但我们没建模的分组名,仅供展示 */
  otherGroups: string[]
  listPrice?: TokenPrices
  listPriceTiers?: PriceTier[]
  /** 官方价没拿到 —— 这种不能直接上架,得人工填 */
  listPriceSource: 'upstream' | 'openrouter' | 'missing'
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

async function fetchJson(url: string, label: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** 上游中文分组名 → 我们的 UpstreamGroup */
const LABEL_TO_GROUP = new Map<string, UpstreamGroup>(
  UPSTREAM_GROUPS.map((g) => [UPSTREAM_GROUP_LABEL[g], g]),
)

function pricesFromUpstreamGroup(p: Record<string, unknown>): TokenPrices {
  return {
    input: num(p.input_price),
    output: num(p.output_price),
    cacheRead: num(p.cached_input_price),
    cacheWrite: num(p.cache_write_price ?? p.input_price),
  }
}

/** 上游 official_pricing 的档位结构 → 我们的 listPrice + tiers */
function officialFromUpstream(row: Record<string, unknown>) {
  const op = row.official_pricing as { tiers?: Record<string, unknown>[] } | undefined
  if (!op?.tiers?.length) return null
  const toPrices = (t: Record<string, unknown>): TokenPrices => ({
    input: num(t.input_price),
    output: num(t.output_price),
    cacheRead: num(t.cached_input_price),
    cacheWrite: num(t.cache_write_price ?? t.input_price),
  })
  const base = op.tiers.find((t) => t.name === 'short_context') ?? op.tiers.find((t) => t.name === 'standard') ?? op.tiers[0]
  const long = op.tiers.find((t) => t.name === 'long_context')
  const tiers: PriceTier[] = []
  if (long && typeof long.min_input_tokens === 'number') {
    tiers.push({ minPromptTokens: long.min_input_tokens, prices: toPrices(long) })
  }
  return { listPrice: toPrices(base), listPriceTiers: tiers.length ? tiers : undefined }
}

/** OpenRouter 单位是「每 token」,换算成每百万 */
function officialFromOpenRouter(rows: Record<string, unknown>[], upstreamId: string): TokenPrices | null {
  // claude-opus-4-8 → anthropic/claude-opus-4.8
  const slug = 'anthropic/' + upstreamId.replace(/-(\d+)-(\d+)$/, '-$1.$2').replace(/-\d{8}$/, '')
  const row = rows.find((r) => r.id === slug)
  const p = row?.pricing as Record<string, string> | undefined
  if (!p) return null
  const per1M = (v: string | undefined) => (v == null ? 0 : Number(v) * 1_000_000)
  return {
    input: per1M(p.prompt),
    output: per1M(p.completion),
    cacheRead: per1M(p.input_cache_read),
    cacheWrite: per1M(p.input_cache_write),
  }
}

/**
 * 拉取上游全部模型,转换成可导入的候选项。
 * @param onlyGroups 只要这些上游分组里的模型(不传则全要)
 */
export async function fetchImportCandidates(onlyGroups?: UpstreamGroup[]): Promise<ImportCandidate[]> {
  const [u, o] = await Promise.all([
    fetchJson(UPSTREAM_URL, '上游报价'),
    fetchJson(OPENROUTER_URL, 'OpenRouter').catch(() => ({ data: [] })),
  ])
  const upRows = ((u as Record<string, unknown>).data ?? []) as Record<string, unknown>[]
  const orRows = ((o as Record<string, unknown>).data ?? []) as Record<string, unknown>[]
  if (!Array.isArray(upRows) || upRows.length === 0) throw new Error('上游返回的模型列表为空')

  const out: ImportCandidate[] = []
  for (const row of upRows) {
    const gps = (Array.isArray(row.group_prices) ? row.group_prices : []) as Record<string, unknown>[]
    const upstreamCny: Partial<Record<UpstreamGroup, TokenPrices>> = {}
    const otherGroups: string[] = []
    for (const gp of gps) {
      const g = LABEL_TO_GROUP.get(String(gp.group))
      if (g) upstreamCny[g] = pricesFromUpstreamGroup(gp)
      else otherGroups.push(String(gp.group))
    }
    // 一个我们建模过的分组都没有 → 现阶段进不了货,跳过
    if (Object.keys(upstreamCny).length === 0) continue
    if (onlyGroups && !onlyGroups.some((g) => upstreamCny[g])) continue

    const upstreamId = String(row.model_name)
    const fromUp = officialFromUpstream(row)
    const fromOr = fromUp ? null : officialFromOpenRouter(orRows, upstreamId)

    out.push({
      upstreamId,
      vendor: String(row.vendor_name ?? ''),
      description: String(row.description ?? ''),
      upstreamCny,
      otherGroups,
      listPrice: fromUp?.listPrice ?? fromOr ?? undefined,
      listPriceTiers: fromUp?.listPriceTiers,
      listPriceSource: fromUp ? 'upstream' : fromOr ? 'openrouter' : 'missing',
    })
  }
  return out.sort((a, b) => a.upstreamId.localeCompare(b.upstreamId))
}
