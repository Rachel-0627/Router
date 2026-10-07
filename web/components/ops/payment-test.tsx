'use client'
/**
 * 支付通道自检面板。
 *
 * API key 加密存在库里、钥匙只在 Vercel,本地拿不到明文 ——
 * 所以这个检查只能跑在服务端,做成按钮是唯一的办法。
 */
import { useActionState } from 'react'
import { testPaymentChannel, type PayTestState } from '@/app/actions/ops-payment-test'

export function PaymentTest() {
  const [state, action, pending] = useActionState<PayTestState, FormData>(
    async () => testPaymentChannel(),
    undefined,
  )

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <h3 className="font-semibold">支付通道自检</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
        真实调一次 NOWPayments：验 key、查最低充值额、建一张收款单、再按单回查。
        <strong>不花钱</strong> —— 建出来的单没人付就是一张废单。
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
      >
        {pending ? '检查中…' : '开始自检'}
      </button>

      {state && (
        <div className="mt-5">
          <p className={`text-[14px] font-medium leading-6 ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {state.ok ? '✅ ' : '❌ '}
            {state.message}
          </p>
          {state.checks?.map((c) => (
            <div key={c.name} className="mt-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
              <div className={`text-[13px] font-medium ${c.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {c.ok ? '✅' : '❌'} {c.name}
              </div>
              <div className="mt-1 break-words font-mono text-[12px] leading-5 text-[var(--muted)]">{c.detail}</div>
            </div>
          ))}
        </div>
      )}
    </form>
  )
}
