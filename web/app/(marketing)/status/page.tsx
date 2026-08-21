import { site } from '@/lib/site'
import { MODELS } from '@/lib/pricing/models'

export const metadata = { title: `Status — ${site.name}` }

/**
 * 阶段1 只做静态占位。阶段6 接 ops/channel-health 的真实探测数据。
 */
export default function Status() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Status</h1>
      <p className="mt-4 text-[15px] leading-7 text-[var(--muted)]">
        Live availability for each model. Capacity depends on upstream providers and can change
        without notice — we publish it here rather than letting you find out mid-session.
      </p>

      <div className="mt-8 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
        <span className="text-[15px] font-medium">All systems operational</span>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {MODELS.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3.5">
                  <div className="font-medium">{m.displayName}</div>
                  <div className="font-mono text-xs text-[var(--muted)]">{m.id}</div>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="inline-flex items-center gap-2 text-[var(--muted)]">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                    Operational
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Automated checks run every five minutes. Historical incidents will appear here.
      </p>

      <div className="mt-12 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-sm leading-6 text-[var(--muted)]">
          {site.name} does not offer an uptime SLA. See our{' '}
          <a href="/legal/terms" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Terms of Service
          </a>
          .
        </p>
      </div>
    </div>
  )
}
