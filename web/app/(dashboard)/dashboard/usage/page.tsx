import { site } from '@/lib/site'
import { getCurrentUser } from '@/lib/auth'
import { listUsage, usageByModel, usageTotals } from '@/lib/db/queries/usage'
import { StatTile, Meter, DailyColumns, ModelBars } from '@/components/dashboard/charts'

export const metadata = { title: `Usage — ${site.name}` }

const DAYS = 30
const money = (m: number) => (m >= 10_000 ? `$${(m / 1e6).toFixed(2)}` : `$${(m / 1e6).toFixed(4)}`)
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1_000 ? `${(n / 1e3).toFixed(1)}K` : String(n)

/** 把有数据的天填进完整的 30 天序列,缺的天补 0 —— 否则柱状图会把时间轴压缩,读起来失真 */
function fillDays(rows: { day: string; revenueMicroUsd: number }[], days: number) {
  const byDay = new Map(rows.map((r) => [r.day, r.revenueMicroUsd]))
  const out: { day: string; value: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ day: d, value: byDay.get(d) ?? 0 })
  }
  return out
}

export default async function Usage() {
  const user = await getCurrentUser()
  if (!user) return null

  const [daily, byModel, totals] = await Promise.all([
    listUsage(user.id, DAYS),
    usageByModel(user.id, DAYS),
    usageTotals(user.id, DAYS),
  ])

  // 缓存命中率 = 命中的输入 token / 全部输入 token
  const promptTotal = totals.input + totals.cacheRead + totals.cacheWrite
  const cacheHitPct = promptTotal > 0 ? (totals.cacheRead / promptTotal) * 100 : 0

  const dayRows = daily.map((d) => ({ day: d.day, revenueMicroUsd: d.revenueMicroUsd }))
  const modelRows = byModel.map((m) => ({ model: m.model, value: Number(m.revenue) }))
  const hasData = totals.requests > 0

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Last {DAYS} days.</p>

      {!hasData ? (
        <p className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
          No usage yet. Once you make requests with an API key, this page shows what you spent, on
          which models, and how much prompt caching saved you.
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatTile label="SPEND" value={money(totals.revenue)} hint={`${totals.requests} requests`} />
            <StatTile
              label="TOKENS"
              value={compact(promptTotal + totals.output)}
              hint={`${compact(promptTotal)} in · ${compact(totals.output)} out`}
            />
            <Meter
              label="CACHE HIT RATE"
              pct={cacheHitPct}
              hint="Cached input costs one tenth of fresh input."
            />
          </div>

          <h2 className="mt-12 text-lg font-semibold">Spend per day</h2>
          <div className="mt-4 rounded-lg border border-[var(--border)] p-5">
            <DailyColumns rows={fillDays(dayRows, DAYS)} />
          </div>

          <h2 className="mt-12 text-lg font-semibold">Spend by model</h2>
          <div className="mt-4 rounded-lg border border-[var(--border)] p-5">
            <ModelBars rows={modelRows} />
          </div>

          {/* 表格孪生体:图上读不到的精确值都在这儿,数值永远不只靠悬停 */}
          <h2 className="mt-12 text-lg font-semibold">Breakdown</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">DAY</th>
                  <th className="px-4 py-3 font-medium">MODEL</th>
                  <th className="px-4 py-3 text-right font-medium">REQUESTS</th>
                  <th className="px-4 py-3 text-right font-medium">INPUT</th>
                  <th className="px-4 py-3 text-right font-medium">CACHED</th>
                  <th className="px-4 py-3 text-right font-medium">OUTPUT</th>
                  <th className="px-4 py-3 text-right font-medium">SPEND</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--muted)]">{d.day}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.model}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{d.requests}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">
                      {compact(d.inputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--accent)]">
                      {compact(d.cacheReadTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">
                      {compact(d.outputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{money(d.revenueMicroUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            We record token counts only — never the contents of your prompts or responses.
          </p>
        </>
      )}
    </>
  )
}
