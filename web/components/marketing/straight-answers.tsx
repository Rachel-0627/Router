/**
 * 「坦白讲」板块 —— 落地页的信任支柱。
 *
 * 为什么要主动写缺点:我们只打八折,价格优势不足以单独成立(见 docs/定价设计.md 第三节)。
 * 便宜 20% 用户觉得合理,但"为什么比官方便宜"这个疑问必须当场消掉,
 * 否则低价本身会变成可信度的敌人。主动披露比等用户自己猜便宜。
 *
 * ⚠️ 这里的说法必须和 lib/site.ts 的 disclosure、/legal/* 保持一致,改一处要同步。
 */
import Link from 'next/link'

const ANSWERS = [
  {
    q: 'Is this an official Anthropic or OpenAI endpoint?',
    a: (
      <>
        No. We are an independent third-party gateway and route your requests through upstream
        providers. Model behavior — including system-level instructions and how the model
        describes itself — can differ from a first-party API.{' '}
        <Link href="/docs#differences" className="underline underline-offset-2 hover:text-[var(--fg)]">
          The specifics
        </Link>
      </>
    ),
  },
  {
    q: 'What happens when upstream capacity is degraded?',
    a: (
      <>
        You get a <code className="font-mono text-[13px]">503</code> with a{' '}
        <code className="font-mono text-[13px]">Retry-After</code> header — never a bare 500 or a
        silently truncated stream. That distinction matters: coding agents retry on 503 and give
        up on 500. Failed requests are not billed.{' '}
        <Link href="/status" className="underline underline-offset-2 hover:text-[var(--fg)]">
          Live status
        </Link>
      </>
    ),
  },
  {
    q: 'What is it actually tuned for?',
    a: 'Coding agent workloads — long sessions, a large cached system prompt resent every turn, heavy tool use. That is the traffic we test against. Evaluate it for your use case before you depend on it.',
  },
  {
    q: 'Can I get my money back?',
    a: 'Unused credits are refunded in full within 30 days. We give no bonus credits and run no promotions, so there is never an argument about which balance gets spent first — there is only one.',
  },
]

export function StraightAnswers() {
  return (
    <section className="border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-sm font-medium tracking-wide text-[var(--muted)]">STRAIGHT ANSWERS</h2>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--muted)]">
          The things you would otherwise have to find out the hard way.
        </p>
        <dl className="mt-9 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {ANSWERS.map((item) => (
            <div key={item.q}>
              <dt className="text-[16px] font-semibold">{item.q}</dt>
              <dd className="mt-2.5 text-sm leading-6 text-[var(--muted)]">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
