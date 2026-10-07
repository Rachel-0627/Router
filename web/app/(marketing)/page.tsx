import Link from 'next/link'
import { site } from '@/lib/site'
import { CodeBlock } from '@/components/marketing/code-block'
import { StraightAnswers } from '@/components/marketing/straight-answers'
import { PaymentNotice } from '@/components/marketing/payment-notice'
import { pricingRows, savingsPct, fmtPrice } from '@/lib/pricing/calculate'

// Sonnet 5 高强度使用 1 小时的 list price 成本。
// 按真实 list 价 $2/$10 算;旧值 $4.65 是基于被取消的 $3/$15 涨价,已作废。
const HOUR_LIST = 3.1

export default async function Home() {
  const rows = await pricingRows()
  const featured = rows.filter((r) => ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'].includes(r.id))
  // 这一段讲的是 Sonnet 5,倍率取它自己身上的(注册表已挂好)
  const claudeRatio = rows.find((r) => r.group === 'claude')?.ratio ?? 0.8
  const hourOurs = HOUR_LIST * claudeRatio

  // 四个硬事实。八折下"便宜"撑不起整个落地页,所以价格只占其中一条,
  // 其余三条讲省心和透明 —— 详见 docs/定价设计.md 第三节。
  const facts = [
    { n: `${savingsPct(claudeRatio)}%`, l: 'below list price', d: 'Every model, every token type. No tiers, no monthly minimum.' },
    { n: `$${hourOurs.toFixed(2)}`, l: 'a heavy agent hour', d: `About 100 Sonnet 5 requests with a large cached prompt — $${HOUR_LIST.toFixed(2)} at list.` },
    { n: '10%', l: 'of input for cache reads', d: 'Where most of a coding agent’s bill actually lives.' },
    { n: '30 days', l: 'to change your mind', d: 'Unused credits refunded in full. No bonus credits, one balance.' },
  ]

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-20 pb-16">
        <p className="mb-4 font-mono text-xs tracking-wide text-[var(--accent)]">
          FOR CLAUDE CODE · CURSOR · CLINE
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
          Point your coding agent somewhere cheaper.{' '}
          <span className="text-[var(--accent)]">Change nothing else.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-7 text-[var(--muted)]">
          One environment variable. Native Anthropic Messages API, streaming, tool calls, and
          prompt caching all keep working exactly as they did. Every model bills at{' '}
          {savingsPct(claudeRatio)}% below list price, on prepaid credits — no subscription.
        </p>

        <div className="mt-8 max-w-2xl">
          <CodeBlock
            label="Claude Code"
            code={`export ANTHROPIC_BASE_URL=${site.apiBaseUrl}\nexport ANTHROPIC_AUTH_TOKEN=sk-your-key\n\nclaude`}
          />
        </div>

        <div className="mt-5 max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <p className="text-[14px] leading-6 text-[var(--muted)]">
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

        {/* 付款方式要在**点注册之前**就看见 —— 不然用户走完注册、建 key、
            撞 402 才发现只能用加密货币,前面的投入全白费 */}
        <div className="mt-5 max-w-2xl">
          <PaymentNotice compact />
        </div>
      </section>

      {/* 四个硬事实 */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-sm font-medium tracking-wide text-[var(--muted)]">NO SURPRISES</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.l}>
                <div className="font-mono text-3xl font-semibold tabular-nums text-[var(--accent)]">
                  {f.n}
                </div>
                <div className="mt-1.5 text-sm font-medium">{f.l}</div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--muted)]">{f.d}</p>
              </div>
            ))}
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
              <h3 className="text-[16px] font-semibold">{f.t}</h3>
              <p className="mt-2.5 text-sm leading-6 text-[var(--muted)]">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 价格预览 —— 每行划线对比 list price,见 docs/定价设计.md 第八节 */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[520px] text-sm">
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
                      <span className="ml-2 rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[12px] text-[var(--accent)]">
                        RECOMMENDED
                      </span>
                    )}
                  </td>
                  {(['input', 'output', 'cacheRead'] as const).map((k) => (
                    <td key={k} className="px-4 py-3.5 text-right">
                      <span
                        className={`font-mono tabular-nums ${k === 'cacheRead' ? 'text-[var(--accent)]' : ''}`}
                      >
                        {fmtPrice(m.sell[k])}
                      </span>
                      <span className="ml-2 font-mono text-[12px] tabular-nums text-[var(--muted)] line-through">
                        {fmtPrice(m.listPrice[k])}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Per million tokens, in USD. Struck-through figures are list price.{' '}
          <Link href="/pricing" className="underline underline-offset-2 hover:text-[var(--fg)]">
            Full pricing
          </Link>
        </p>
      </section>

      <StraightAnswers />
    </>
  )
}
