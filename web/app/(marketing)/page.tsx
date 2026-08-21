import Link from 'next/link'
import { site } from '@/lib/site'
import { CodeBlock } from '@/components/marketing/code-block'
import { pricingRows, savingsPct, fmtPrice } from '@/lib/pricing/calculate'
import { env } from '@/lib/env'

const HOUR_LIST = 4.65 // Sonnet 5 高强度使用 1 小时的 list price 成本

export default function Home() {
  const rows = pricingRows()
  const featured = rows.filter((r) => ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'].includes(r.id))
  const hourOurs = HOUR_LIST * env.PRICE_RATIO_OF_OFFICIAL

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-20 pb-16">
        <p className="mb-4 font-mono text-xs tracking-wide text-[var(--accent)]">
          FOR CLAUDE CODE · CURSOR · CLINE
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
          Run your coding agent for{' '}
          <span className="text-[var(--accent)]">{savingsPct()}% less.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-7 text-[var(--muted)]">
          A drop-in API gateway for Claude Code, Cursor, and Cline. Change one environment
          variable — streaming, tool calls, and prompt caching all keep working. Prepaid
          credits, no subscription, no monthly minimum.
        </p>

        <div className="mt-8 max-w-2xl">
          <CodeBlock
            label="Claude Code"
            code={`export ANTHROPIC_BASE_URL=${site.apiBaseUrl}\nexport ANTHROPIC_AUTH_TOKEN=sk-your-key\n\nclaude`}
          />
        </div>

        <div className="mt-5 max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <p className="text-[13px] leading-6 text-[var(--muted)]">
            Independent third-party gateway — not affiliated with Anthropic. Model behavior can
            differ from a first-party API.{' '}
            <Link href="/docs#differences" className="underline underline-offset-2 hover:text-[var(--fg)]">
              What that means
            </Link>
          </p>
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-md bg-[var(--fg)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
          >
            Create an API key
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--card)]"
          >
            See pricing
          </Link>
        </div>
      </section>

      {/* 一小时成本对比 */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-sm font-medium tracking-wide text-[var(--muted)]">
            WHAT AN HOUR ACTUALLY COSTS
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--muted)]">
            A heavy hour of agent work on Claude Sonnet 5 — roughly 100 requests, each
            re-reading a large cached system prompt.
          </p>
          <div className="mt-7 flex flex-wrap items-end gap-10">
            <div>
              <div className="font-mono text-4xl font-semibold tabular-nums text-[var(--accent)]">
                ${hourOurs.toFixed(2)}
              </div>
              <div className="mt-1.5 text-sm text-[var(--muted)]">on {site.name}</div>
            </div>
            <div>
              <div className="font-mono text-4xl font-semibold tabular-nums text-[var(--muted)] line-through decoration-[1.5px]">
                ${HOUR_LIST.toFixed(2)}
              </div>
              <div className="mt-1.5 text-sm text-[var(--muted)]">at list price</div>
            </div>
          </div>
        </div>
      </section>

      {/* 三个卖点 */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              t: 'Drop-in, not a rewrite',
              d: 'Native Anthropic Messages API plus an OpenAI-compatible endpoint. Change one base URL — your tool calls and streaming keep working exactly as before.',
            },
            {
              t: 'Prompt caching that actually caches',
              d: 'Cache reads are billed at a tenth of input. For coding agents that resend a large system prompt every turn, this is where most of the bill lives.',
            },
            {
              t: 'You can see where the money went',
              d: 'Per-key, per-model, per-day usage with cache hit rates. Set a daily cap on any key so a runaway loop cannot drain your balance.',
            },
          ].map((f) => (
            <div key={f.t}>
              <h3 className="text-[15px] font-semibold">{f.t}</h3>
              <p className="mt-2.5 text-sm leading-6 text-[var(--muted)]">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 价格预览 */}
      <section className="mx-auto max-w-5xl px-5 pb-8">
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--card)] text-left">
              <tr className="text-xs tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">MODEL</th>
                <th className="px-4 py-3 text-right font-medium">INPUT</th>
                <th className="px-4 py-3 text-right font-medium">OUTPUT</th>
                <th className="px-4 py-3 text-right font-medium">CACHED INPUT</th>
              </tr>
            </thead>
            <tbody>
              {featured.map((m) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3.5">
                    <span className="font-medium">{m.displayName}</span>
                    {m.recommended && (
                      <span className="ml-2 rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                        RECOMMENDED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{fmtPrice(m.sell.input)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{fmtPrice(m.sell.output)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[var(--accent)]">
                    {fmtPrice(m.sell.cacheRead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Per million tokens, in USD. Prepaid credits — no subscription.{' '}
          <Link href="/pricing" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Full pricing
          </Link>
        </p>
      </section>
    </>
  )
}
