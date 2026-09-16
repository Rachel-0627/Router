/**
 * 价格漂移校验 —— 同时盯住两端,任一端变了立刻报警。
 *
 *   上游进货价   zexitongxue /api/pricing   → 决定你的成本和毛利
 *   官方 list 价  OpenRouter /api/v1/models  → 决定你的售价和"省了多少"的宣传
 *
 * 为什么必须自动化:两端都会在你不知情的时候变。上游调价影响毛利,
 * 官方调价影响你定价页上那句"XX% less than list"是真是假 —— 后者是合规问题。
 *
 * 跑法:  npm run check:pricing
 * 退出码: 0 = 全部一致  1 = 发现漂移  2 = 抓取失败(网络/上游故障)
 *
 * ⚠️ 两个上游接口都是公开只读的,不需要密钥。本脚本不读也不写任何凭据。
 * ⚠️ 但**需要数据库** —— 模型清单现在存在库里(运营后台可增删改),不再写死在代码。
 */
import { getModels } from '../lib/pricing/registry'
import {
  UPSTREAM_GROUPS,
  UPSTREAM_GROUP_LABEL,
  type ModelPricing,
  type TokenPrices,
  type UpstreamGroup,
} from '../lib/pricing/types'
import { fallbackChain, grossMarginPct, worstCaseMarginPct, lastResortGroup } from '../lib/pricing/calculate'

const UPSTREAM_URL = 'https://zexitongxue.com/api/pricing'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models'
const TIMEOUT_MS = 20_000
const RETRIES = 2
/** 浮点比较容差。上游返回的数字带浮点噪声(如 0.17600000000000002)。 */
const EPSILON = 1e-6

/**
 * 官方 list 价的比对基准,两条线来源不同:
 *   Claude 线  用 OpenRouter 上 Anthropic 直连端点的报价
 *   Codex 线   用上游 /api/pricing 自带的 official_pricing 字段(更直接)
 * 我们的模型 id 和 OpenRouter 命名规则不同,只能显式映射,别用规则推导。
 */
const OPENROUTER_ID: Record<string, string> = {
  'claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'claude-opus-4-8': 'anthropic/claude-opus-4.8',
  'claude-fable-5': 'anthropic/claude-fable-5',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
}

/** 从上游的 official_pricing 里取短上下文档的官方价 */
function upstreamOfficialShortTier(row: Record<string, unknown> | undefined): Partial<TokenPrices> {
  const op = row?.official_pricing as { tiers?: Record<string, unknown>[] } | undefined
  if (!op?.tiers?.length) return {}
  const t =
    op.tiers.find((x) => x.name === 'short_context') ??
    op.tiers.find((x) => x.name === 'standard') ??
    op.tiers[0]
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  return {
    input: num(t.input_price),
    output: num(t.output_price),
    cacheRead: num(t.cached_input_price),
    cacheWrite: num(t.cache_write_price),
  }
}

type Drift = { model: string; field: string; ours: number | string; actual: number | string }

async function fetchJson(url: string, label: string): Promise<unknown> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      lastErr = e
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`拉取${label}失败(已重试${RETRIES}次): ${String(lastErr)}`)
}

/** 校验抓回来的数据长得对不对,不对就当抓取失败,绝不拿脏数据做判断。 */
function asArray(data: unknown, key: string, label: string): Record<string, unknown>[] {
  const arr = (data as Record<string, unknown>)?.[key]
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`${label}返回的 ${key} 不是非空数组`)
  return arr as Record<string, unknown>[]
}

const near = (a: number, b: number) => Math.abs(a - b) < EPSILON

function diffPrices(
  model: string,
  scope: string,
  ours: TokenPrices,
  actual: Partial<TokenPrices>,
): Drift[] {
  const out: Drift[] = []
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
    const a = actual[k]
    if (a === undefined) continue
    if (!near(ours[k], a)) out.push({ model, field: `${scope}.${k}`, ours: ours[k], actual: a })
  }
  return out
}

/** 上游同一模型可能出现在多个分组,按分组名取出我们关心的那几档。 */
function upstreamPricesFor(
  rows: Record<string, unknown>[],
  upstreamId: string,
): Partial<Record<UpstreamGroup, Partial<TokenPrices>>> {
  const row = rows.find((r) => r.model_name === upstreamId)
  if (!row) return {}
  const prices = Array.isArray(row.group_prices) ? row.group_prices : []
  const byLabel = new Map<string, Record<string, unknown>>()
  for (const p of prices as Record<string, unknown>[]) byLabel.set(String(p.group), p)

  const out: Partial<Record<UpstreamGroup, Partial<TokenPrices>>> = {}
  for (const g of UPSTREAM_GROUPS) {
    const p = byLabel.get(UPSTREAM_GROUP_LABEL[g])
    if (!p) continue
    out[g] = {
      input: Number(p.input_price),
      output: Number(p.output_price),
      cacheRead: Number(p.cached_input_price),
      ...(p.cache_write_price != null ? { cacheWrite: Number(p.cache_write_price) } : {}),
    }
  }
  return out
}

function checkModel(
  m: ModelPricing,
  upstreamRows: Record<string, unknown>[],
  orRows: Record<string, unknown>[],
): Drift[] {
  const drifts: Drift[] = []

  // ── 官方 list 价 ──
  // Codex 线:上游自己给了 official_pricing,直接比,不绕 OpenRouter
  if (m.group === 'codex') {
    const row = upstreamRows.find((r) => r.model_name === m.upstreamId)
    const official = upstreamOfficialShortTier(row)
    if (Object.keys(official).length === 0) {
      drifts.push({ model: m.id, field: 'list价', ours: '有', actual: '上游未提供 official_pricing' })
    } else {
      drifts.push(...diffPrices(m.id, 'list', m.listPrice, official))
    }
    return [...drifts, ...checkUpstream(m, upstreamRows)]
  }

  const orId = OPENROUTER_ID[m.id]
  const orRow = orId ? orRows.find((r) => r.id === orId) : undefined
  if (!orId) {
    drifts.push({ model: m.id, field: 'list价', ours: '无映射', actual: '请补 OPENROUTER_ID' })
  } else if (!orRow) {
    drifts.push({ model: m.id, field: 'list价', ours: orId, actual: 'OpenRouter 查无此模型(可能已下线)' })
  } else {
    const p = orRow.pricing as Record<string, string> | undefined
    // OpenRouter 单位是「每 token」,我们是「每百万 token」
    const per1M = (v: string | undefined) => (v == null ? undefined : Number(v) * 1_000_000)
    drifts.push(
      ...diffPrices(m.id, 'list', m.listPrice, {
        input: per1M(p?.prompt),
        output: per1M(p?.completion),
        cacheRead: per1M(p?.input_cache_read),
        cacheWrite: per1M(p?.input_cache_write),
      }),
    )
  }

  return [...drifts, ...checkUpstream(m, upstreamRows)]
}

/** 上游进货价比对。只比该模型所属产品线用得到的那几档。 */
function checkUpstream(m: ModelPricing, upstreamRows: Record<string, unknown>[]): Drift[] {
  const drifts: Drift[] = []
  const live = upstreamPricesFor(upstreamRows, m.upstreamId)
  if (Object.keys(live).length === 0) {
    drifts.push({ model: m.id, field: '上游', ours: m.upstreamId, actual: '上游查无此模型' })
    return drifts
  }
  // 只看这个产品线的降级链涉及的分组,不跨线比
  const relevant = UPSTREAM_GROUPS.filter(
    (g) => m.upstreamCny[g] != null || fallbackChain(m).includes(g),
  )
  for (const g of relevant) {
    const ours = m.upstreamCny[g]
    const actual = live[g]
    if (!ours && !actual) continue
    if (!ours && actual) {
      drifts.push({ model: m.id, field: `上游.${g}`, ours: '未收录', actual: '上游新增了这一档' })
      continue
    }
    if (ours && !actual) {
      drifts.push({ model: m.id, field: `上游.${g}`, ours: '已收录', actual: '上游已下架这一档⚠️降级链变短' })
      continue
    }
    if (ours && actual) drifts.push(...diffPrices(m.id, `上游.${g}`, ours, actual))
  }
  return drifts
}

async function main() {
  console.log('拉取上游报价和官方 list 价…')
  let upstreamRows: Record<string, unknown>[]
  let orRows: Record<string, unknown>[]
  try {
    const [u, o] = await Promise.all([
      fetchJson(UPSTREAM_URL, '上游报价'),
      fetchJson(OPENROUTER_URL, '官方 list 价'),
    ])
    upstreamRows = asArray(u, 'data', '上游')
    orRows = asArray(o, 'data', 'OpenRouter')
  } catch (e) {
    console.error(`\n❌ 抓取失败,本次校验无效(不代表价格没问题):\n   ${(e as Error).message}\n`)
    process.exit(2)
  }

  const MODELS = await getModels()
  const drifts = MODELS.flatMap((m) => checkModel(m, upstreamRows, orRows))
  console.log(`已核对 ${MODELS.length} 个模型 · 上游 ${upstreamRows.length} 条 · OpenRouter ${orRows.length} 条\n`)

  // ── 赔本护栏:降级到兜底分组时毛利不能为负 ──
  // 上游的自建池按固定价收,不分模型;官方价低的模型打折后可能低于进货价。
  const losers = MODELS.map((m) => ({ m, worst: worstCaseMarginPct(m), primary: grossMarginPct(m) }))
    .filter((x) => x.worst !== null && x.worst < 5)
  if (losers.length > 0) {
    console.log('🔴 赔本风险(降级到兜底分组时毛利 < 5%):\n')
    for (const { m, worst, primary } of losers) {
      const g = lastResortGroup(m)
      console.log(
        `  ${m.id.padEnd(20)} 主力 ${primary!.toFixed(1)}%  →  兜底(${g ? UPSTREAM_GROUP_LABEL[g] : '?'}) ${worst!.toFixed(1)}%`,
      )
    }
    console.log('\n  处理方式三选一:提高该组倍率 / 给该模型单独定倍率 / 不上架这个模型。\n')
  }

  if (drifts.length === 0) {
    console.log(losers.length === 0 ? '✅ 全部一致,价格没有漂移。' : '价格无漂移,但存在上面的赔本风险。')
    if (losers.length > 0) process.exit(1)
    return
  }
  console.log(`⚠️  发现 ${drifts.length} 处漂移:\n`)
  for (const d of drifts) {
    const ours = typeof d.ours === 'number' ? d.ours.toFixed(4) : d.ours
    const actual = typeof d.actual === 'number' ? d.actual.toFixed(4) : d.actual
    console.log(`  ${d.model.padEnd(20)} ${d.field.padEnd(24)} 我们: ${String(ours).padEnd(14)} 实际: ${actual}`)
  }
  console.log('\n修 lib/pricing/models.ts 后重跑本脚本。')
  process.exit(1)
}

main()
