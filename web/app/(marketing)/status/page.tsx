import { site } from '@/lib/site'
import { channelStatuses, recentIncidents } from '@/lib/db/queries/status'
import { featureReady } from '@/lib/env'

export const metadata = { title: `Status — ${site.name}` }
/** 状态必须是实时的,不能被静态缓存 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const fmtTime = (d: Date) =>
  new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function Dot({ up }: { up: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${up ? 'bg-[var(--accent)]' : 'bg-red-500'}`}
      aria-hidden
    />
  )
}

/** 没有数据时的诚实说法 —— 绝不默认显示「一切正常」 */
function NoData({ reason }: { reason: string }) {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-[var(--border)] px-5 py-4">
      <div className="text-[16px] font-medium text-[var(--muted)]">Monitoring is not reporting yet</div>
      <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{reason}</p>
    </div>
  )
}

export default async function Status() {
  let channels: Awaited<ReturnType<typeof channelStatuses>> = []
  let incidents: Awaited<ReturnType<typeof recentIncidents>> = []
  let dbDown = false

  if (featureReady.db()) {
    try {
      ;[channels, incidents] = await Promise.all([channelStatuses(), recentIncidents(10)])
    } catch {
      dbDown = true
    }
  }

  const allUp = channels.length > 0 && channels.every((c) => c.current === 'up')
  const anyUp = channels.some((c) => c.current === 'up')

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Status</h1>
      <p className="mt-4 text-[16px] leading-7 text-[var(--muted)]">
        Live upstream availability. Capacity depends on upstream providers and can change without
        notice — we publish it here rather than letting you find out mid-session.
      </p>

      {channels.length === 0 ? (
        <NoData
          reason={
            dbDown || !featureReady.db()
              ? 'We cannot reach our monitoring store right now, so we will not claim anything about current capacity.'
              : 'No probe results have been recorded yet. This page fills in once health checks start running.'
          }
        />
      ) : (
        <>
          {/* 总体状态:只有全部正常才说正常,否则如实说降级 */}
          <div
            className={`mt-8 flex items-center gap-3 rounded-lg border px-5 py-4 ${
              allUp
                ? 'border-[var(--border)] bg-[var(--card)]'
                : anyUp
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/[0.04]'
                  : 'border-red-500/40 bg-red-500/[0.05]'
            }`}
          >
            <Dot up={anyUp} />
            <span className="text-[16px] font-medium">
              {allUp
                ? 'All upstream routes operational'
                : anyUp
                  ? 'Running on backup capacity — requests are being served, quality may vary'
                  : 'No upstream capacity available — requests are returning 503'}
            </span>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">ROUTE</th>
                  <th className="px-4 py-3 font-medium">NOW</th>
                  <th className="px-4 py-3 text-right font-medium">24H UPTIME</th>
                  <th className="px-4 py-3 text-right font-medium">LAST CHECK</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channelId} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{c.channelName}</div>
                      {c.upstreamGroup && (
                        <div className="font-mono text-xs text-[var(--muted)]">{c.upstreamGroup}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-2">
                        <Dot up={c.current === 'up'} />
                        <span className={c.current === 'up' ? '' : 'text-red-500'}>
                          {c.current === 'up' ? 'Operational' : 'Down'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                      {c.uptime24h === null ? (
                        <span className="text-[var(--muted)]">—</span>
                      ) : (
                        `${c.uptime24h.toFixed(1)}%`
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                      {fmtTime(c.lastCheckedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Uptime is shown only once we have at least three checks in the window; otherwise it reads
            “—” rather than a number we cannot stand behind.
          </p>
        </>
      )}

      {incidents.length > 0 && (
        <>
          <h2 className="mt-12 text-lg font-semibold">Recent incidents</h2>
          <ul className="mt-4 space-y-2.5">
            {incidents.map((i, idx) => (
              <li key={idx} className="flex gap-3 rounded-lg border border-[var(--border)] px-4 py-3 text-sm">
                <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{fmtTime(i.checkedAt)}</span>
                <span>
                  <span className="font-medium">{i.channelName}</span>
                  {i.upstreamGroup && <span className="text-[var(--muted)]"> · {i.upstreamGroup}</span>}
                  <span className="text-[var(--muted)]"> — unavailable</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-12 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold">How we handle outages</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          When a route goes down we fail over automatically. If every route is unavailable the API
          returns <code className="font-mono text-[14px]">503</code> with a{' '}
          <code className="font-mono text-[14px]">Retry-After</code> header so your agent can retry
          cleanly instead of crashing. Unused credits are always refundable — see our{' '}
          <a href="/legal/refund" className="underline underline-offset-2 hover:text-[var(--fg)]">
            refund policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
