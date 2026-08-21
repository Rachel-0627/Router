import { site } from '@/lib/site'
import { pricingRows, savingsPct, fmtPrice } from '@/lib/pricing/calculate'

export const metadata = { title: `Pricing — ${site.name}` }

export default function Pricing() {
  const rows = pricingRows()
  const fmtCtx = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`)

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[var(--muted)]">
        Every model is priced at <strong className="text-[var(--fg)]">{Math.round(100 - savingsPct())}% of
        list price</strong> — {savingsPct()}% less than you would pay at list. Prepaid credits,
        no subscription, no minimum monthly spend.
      </p>

      {/* 价格表 */}
      <div className="mt-10 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[var(--card)] text-left">
            <tr className="text-xs tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3 font-medium">MODEL</th>
              <th className="px-4 py-3 text-right font-medium">INPUT</th>
              <th className="px-4 py-3 text-right font-medium">OUTPUT</th>
              <th className="px-4 py-3 text-right font-medium">CACHED INPUT</th>
              <th className="px-4 py-3 text-right font-medium">CACHE WRITE</th>
              <th className="px-4 py-3 text-right font-medium">CONTEXT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)] align-top">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.displayName}</span>
                    {m.recommended && (
                      <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">{m.id}</div>
                  <div className="mt-1.5 max-w-xs text-xs leading-5 text-[var(--muted)]">{m.blurb}</div>
                </td>
                {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((k) => (
                  <td key={k} className="px-4 py-4 text-right">
                    <div
                      className={`font-mono tabular-nums ${
                        k === 'cacheRead' ? 'text-[var(--accent)]' : ''
                      }`}
                    >
                      {fmtPrice(m.sell[k])}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-[var(--muted)] line-through">
                      {fmtPrice(m.listPrice[k])}
                    </div>
                  </td>
                ))}
                <td className="px-4 py-4 text-right font-mono tabular-nums text-[var(--muted)]">
                  {fmtCtx(m.contextWindow)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        USD per million tokens. Struck-through figures are list price. Cached input is billed at
        one tenth of input — for coding agents this is usually most of the bill.
      </p>

      {/* 充值档位 */}
      <h2 className="mt-16 text-xl font-semibold">Credits</h2>
      <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--muted)]">
        Top up any amount from ${site.minTopupUsd}. Credits never expire. What you pay is what
        you get — there are no bonus credits, tiers, or promotional balances to keep track of.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {site.topupTiers.map((t) => (
          <div
            key={t.amount}
            className={`rounded-lg border p-5 ${
              'popular' in t && t.popular
                ? 'border-[var(--accent)] bg-[var(--accent)]/[0.04]'
                : 'border-[var(--border)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xl font-semibold">{t.label}</span>
              {'popular' in t && t.popular && (
                <span className="rounded bg-[var(--accent)]/12 px-2 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                  MOST POPULAR
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-[var(--muted)]">${t.amount} in credits</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Working at higher volume? <a href={`mailto:${site.supportEmail}`} className="underline underline-offset-2 hover:text-[var(--fg)]">Get in touch</a> about volume pricing.
      </p>

      {/* 披露 */}
      <div className="mt-14 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="text-sm font-semibold">Before you sign up</h3>
        <p className="mt-2.5 text-sm leading-6 text-[var(--muted)]">{site.disclosure}</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Capacity depends on upstream providers and can be interrupted without notice. We do not
          offer an uptime SLA. Unused credits are refundable in full within 30 days — see our{' '}
          <a href="/legal/refund" className="underline underline-offset-2 hover:text-[var(--fg)]">
            refund policy
          </a>
          .
        </p>
      </div>
    </div>
  )
}
