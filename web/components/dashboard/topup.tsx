'use client'
import { useActionState } from 'react'
import { startCheckout, type CheckoutState } from '@/app/actions/billing'
import { site } from '@/lib/site'

export function Topup() {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(startCheckout, undefined)

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {site.topupTiers.map((t) => (
          <form key={t.amount} action={formAction}>
            <input type="hidden" name="amount" value={t.amount} />
            <button
              type="submit"
              disabled={pending}
              className={`w-full rounded-lg border p-5 text-left transition-colors disabled:opacity-60 ${
                'popular' in t && t.popular
                  ? 'border-[var(--accent)] bg-[var(--accent)]/[0.04]'
                  : 'border-[var(--border)] hover:border-[var(--muted)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-semibold">{t.label}</span>
                {'popular' in t && t.popular && (
                  <span className="rounded bg-[var(--accent)]/12 px-2 py-0.5 font-mono text-[12px] text-[var(--accent)]">
                    POPULAR
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm text-[var(--muted)]">${t.amount} in credits</div>
            </button>
          </form>
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="mt-4 rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2.5 text-sm text-red-500">
          {state.error}
        </p>
      )}
      <p className="mt-4 text-sm text-[var(--muted)]">
        What you pay is what you get — no bonus credits or tiers. Unused credits are refundable in
        full within 30 days.
      </p>
    </div>
  )
}
