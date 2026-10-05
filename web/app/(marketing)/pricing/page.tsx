import { site } from '@/lib/site'
import { pricingRows, savingsPct, fmtPrice } from '@/lib/pricing/calculate'
import { getGroups } from '@/lib/pricing/groups'
import type { PricingRow } from '@/lib/pricing/calculate'

export const metadata = { title: `Pricing — ${site.name}` }

const PRICE_COLS = [
  { key: 'input', label: 'INPUT' },
  { key: 'output', label: 'OUTPUT' },
  { key: 'cacheRead', label: 'CACHED INPUT' },
  { key: 'cacheWrite', label: 'CACHE WRITE' },
] as const

const fmtCtx = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}K`)

function GroupTable({ rows, saving }: { rows: PricingRow[]; saving: number }) {
  const hasTiers = rows.some((m) => m.listPriceTiers?.length)
  return (
    <>
      <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="bg-[var(--card)] text-left">
            <tr className="text-xs tracking-wide text-[var(--muted)]">
              <th className="px-4 py-3 font-medium">MODEL</th>
              {PRICE_COLS.map((c) => (
                <th key={c.key} className="px-4 py-3 text-right font-medium">
                  {c.label}
                  <div className="mt-0.5 font-mono text-[12px] font-normal opacity-70">ours / list</div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">CONTEXT</th>
              <th className="px-4 py-3 text-right font-medium">YOU SAVE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)] align-top">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.displayName}</span>
                    {m.recommended && (
                      <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[12px] text-[var(--accent)]">
                        RECOMMENDED
                      </span>
                    )}
                    {m.legacy && (
                      <span className="rounded bg-[var(--muted)]/15 px-1.5 py-0.5 font-mono text-[12px] text-[var(--muted)]">
                        LEGACY
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">{m.id}</div>
                  <div className="mt-1.5 max-w-xs text-xs leading-5 text-[var(--muted)]">{m.blurb}</div>
                </td>
                {PRICE_COLS.map((c) => (
                  <td key={c.key} className="px-4 py-4 text-right">
                    <div
                      className={`font-mono font-medium tabular-nums ${
                        c.key === 'cacheRead' ? 'text-[var(--accent)]' : ''
                      }`}
                    >
                      {fmtPrice(m.sell[c.key])}
                    </div>
                    <div className="mt-0.5 font-mono text-xs tabular-nums text-[var(--muted)] line-through decoration-[var(--muted)]/60">
                      {fmtPrice(m.listPrice[c.key])}
                    </div>
                  </td>
                ))}
                <td className="px-4 py-4 text-right font-mono tabular-nums text-[var(--muted)]">
                  {fmtCtx(m.contextWindow)}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="inline-block rounded bg-[var(--accent)]/12 px-2 py-1 font-mono text-sm font-semibold tabular-nums text-[var(--accent)]">
                    −{saving}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasTiers && (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Prices shown are for requests under 272K input tokens. Above that, the upstream list price
          steps up and so does ours — the discount stays the same.
        </p>
      )}
    </>
  )
}

export default async function Pricing() {
  // 分组名单来自数据库 —— 后台新开一条产品线,定价页自动多一段
  const [rows, groups] = await Promise.all([pricingRows(), getGroups()])

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-4 max-w-2xl text-[16px] leading-7 text-[var(--muted)]">
        Every model is priced as a fixed percentage of list price. Prepaid credits, no
        subscription, no minimum monthly spend.
      </p>

      {groups.map((g) => {
        const groupRows = rows.filter((m) => m.group === g.id)
        if (groupRows.length === 0) return null
        // 倍率和上架状态都来自数据库(挂在模型上),不是代码里的默认值
        const ratio = groupRows[0].ratio
        const isLive = groupRows[0].groupStatus === 'live'
        const saving = savingsPct(ratio)
        return (
          <section key={g.id} className="mt-12">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{g.displayName}</h2>
              {!isLive ? (
                <span className="rounded bg-[var(--muted)]/15 px-2 py-0.5 font-mono text-[12px] text-[var(--muted)]">
                  COMING SOON
                </span>
              ) : (
                <span className="rounded bg-[var(--accent)]/12 px-2 py-0.5 font-mono text-[12px] text-[var(--accent)]">
                  {100 - saving}% OF LIST
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{g.blurb}</p>
            {!isLive && (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Not available yet — we are still validating this route. Prices are indicative.
              </p>
            )}
            <GroupTable rows={groupRows} saving={saving} />
          </section>
        )
      })}

      <p className="mt-4 text-xs text-[var(--muted)]">
        USD per million tokens. The upper figure is our price; the struck-through figure below it is
        list price. Cached input is billed at one tenth of input — for coding agents this is usually
        most of the bill.
      </p>

      {/* 充值档位 */}
      <h2 className="mt-16 text-xl font-semibold">Credits</h2>
      <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--muted)]">
        Top up any amount from ${site.minTopupUsd}. Credits never expire and work across every
        model group. What you pay is what you get — no bonus credits or tiers to keep track of.
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
                <span className="rounded bg-[var(--accent)]/12 px-2 py-0.5 font-mono text-[12px] text-[var(--accent)]">
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
