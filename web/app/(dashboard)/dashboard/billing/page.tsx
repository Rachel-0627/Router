import { site } from '@/lib/site'
import { getCurrentUser } from '@/lib/auth'
import { getBalanceMicroUsd } from '@/lib/credits'
import { listLedger, listOrders } from '@/lib/db/queries/ledger'
import { Topup } from '@/components/dashboard/topup'

export const metadata = { title: `Billing — ${site.name}` }

const usd = (micro: number) => `${micro < 0 ? '−' : ''}$${Math.abs(micro / 1_000_000).toFixed(micro !== 0 && Math.abs(micro) < 10_000 ? 4 : 2)}`
const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const LABEL: Record<string, string> = {
  topup: 'Credits added',
  usage: 'API usage',
  refund: 'Refund',
  adjustment: 'Adjustment',
}

export default async function Billing() {
  const user = await getCurrentUser()
  if (!user) return null
  const [balance, ledger, orders] = await Promise.all([
    getBalanceMicroUsd(user.id),
    listLedger(user.id, 100),
    listOrders(user.id, 50),
  ])
  const pending = orders.filter((o) => o.status === 'pending')

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>

      <div className="mt-6 rounded-lg border border-[var(--border)] p-5">
        <div className="text-xs tracking-wide text-[var(--muted)]">CURRENT BALANCE</div>
        <div className="mt-2 font-mono text-4xl font-semibold tabular-nums">{usd(balance)}</div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Add credits</h2>
      <div className="mt-4">
        <Topup />
      </div>

      {pending.length > 0 && (
        <p className="mt-6 rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)]">
          You have {pending.length} payment{pending.length > 1 ? 's' : ''} still processing. Credits
          appear here as soon as the payment clears.
        </p>
      )}

      <h2 className="mt-12 text-lg font-semibold">Transactions</h2>
      {ledger.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nothing yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">WHEN</th>
                <th className="px-4 py-3 font-medium">WHAT</th>
                <th className="px-4 py-3 font-medium">DETAIL</th>
                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 text-[var(--muted)]">{fmtDate(row.createdAt)}</td>
                  <td className="px-4 py-3">{LABEL[row.type] ?? row.type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{row.note ?? '—'}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      row.deltaMicroUsd >= 0 ? 'text-[var(--accent)]' : ''
                    }`}
                  >
                    {usd(row.deltaMicroUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--muted)]">
        Balance is the sum of this ledger — we never store a balance field, so the numbers here
        always add up. Questions? <a href={`mailto:${site.supportEmail}`} className="underline underline-offset-2">Contact us</a>.
      </p>
    </>
  )
}
