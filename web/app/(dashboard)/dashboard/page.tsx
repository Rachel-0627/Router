import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getBalanceMicroUsd } from '@/lib/credits'
import { LowBalance } from '@/components/dashboard/low-balance'
import { countActiveKeys, spendSinceMicroUsd } from '@/lib/db/queries/usage'
import { site } from '@/lib/site'

export const metadata = { title: `Overview — ${site.name}` }

/** 余额来自 credit_ledger 求和 —— 没有余额字段,不会对不上账 */
export default async function Overview() {
  const user = await getCurrentUser()
  if (!user) return null
  const [balance, keyCount, spend7d] = await Promise.all([
    getBalanceMicroUsd(user.id),
    countActiveKeys(user.id),
    spendSinceMicroUsd(user.id, 7),
  ])

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <div className="mt-6">
        <LowBalance balanceMicroUsd={balance} spend7dMicroUsd={spend7d} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] p-5">
          <div className="text-xs tracking-wide text-[var(--muted)]">BALANCE</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">
            ${(balance / 1_000_000).toFixed(2)}
          </div>
          <Link
            href="/dashboard/billing"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-2"
          >
            Add credits
          </Link>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-5">
          <div className="text-xs tracking-wide text-[var(--muted)]">SPEND · LAST 7 DAYS</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">
            ${(spend7d / 1_000_000).toFixed(spend7d > 0 && spend7d < 10_000 ? 4 : 2)}
          </div>
          <Link
            href="/dashboard/usage"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-2"
          >
            View usage
          </Link>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-5">
          <div className="text-xs tracking-wide text-[var(--muted)]">ACTIVE KEYS</div>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">{keyCount}</div>
          <Link
            href="/dashboard/keys"
            className="mt-3 inline-block text-sm text-[var(--accent)] underline underline-offset-2"
          >
            {keyCount === 0 ? 'Create a key' : 'Manage keys'}
          </Link>
        </div>
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="text-sm font-semibold">Get started</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Create an API key, then point your coding agent at{' '}
          <code className="font-mono text-[14px]">{site.apiBaseUrl}</code>.
        </p>
      </div>
    </>
  )
}
