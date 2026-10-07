'use client'
/**
 * 回调防线演练面板。
 *
 * 真实付款那一环暂时验不了(要先有 USDT),但「被伪造回调骗走额度」
 * 这个风险和真实付款无关 —— 它随时可能发生,而且一旦发生就是白送额度。
 */
import { useActionState } from 'react'
import { testWebhookDefenses, type WebhookTestState } from '@/app/actions/ops-webhook-test'

export function WebhookTest() {
  const [state, action, pending] = useActionState<WebhookTestState, FormData>(
    async () => testWebhookDefenses(),
    undefined,
  )

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <h3 className="font-semibold">回调防线演练</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
        不花钱。伪造四种回调打我们自己，逐层验证防线：猜错地址、签名错、
        订单号是编的、以及<strong>最关键的那一道</strong> —— 签名合法且订单真实，
        但上游查无此付款时，系统该不该加额度（答案是不该）。
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
      >
        {pending ? '演练中…' : '开始演练'}
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
