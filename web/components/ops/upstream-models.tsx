'use client'
/**
 * 拉取上游可用模型清单。
 *
 * 和「填模型名硬试」互补:那个验证单个名字通不通,这个直接列出
 * **这把 key 到底能调哪些** —— 开新产品线时不用一个个猜名字。
 */
import { useActionState } from 'react'
import { listUpstreamModels } from '@/app/actions/ops-upstream-test'
import { type SecretState } from '@/app/actions/ops-secrets'
import type { KeyChoice } from './upstream-test'

export function UpstreamModels({ keys }: { keys: KeyChoice[] }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(listUpstreamModels, undefined)
  const usable = keys.filter((k) => k.configured)
  if (usable.length === 0) return null

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <h3 className="font-semibold">上游有哪些模型</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
        列出这把 key 实际能调的全部模型名。开新产品线时用它,不用猜名字。
        <strong>只给名字,不给进货价</strong> —— 价格还得去上游价格页看。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">用哪把 key</span>
          <select
            name="keySlot"
            defaultValue={usable[0]?.slot}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
          >
            {usable.map((k) => (
              <option key={k.slot} value={k.slot}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">只看含某段文字的(可留空)</span>
          <input
            name="filter"
            autoComplete="off"
            placeholder="glm"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[14px]"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--card)] disabled:opacity-50"
          >
            {pending ? '拉取中…' : '拉取清单'}
          </button>
        </div>
      </div>

      {state && (
        <p
          className={`mt-4 whitespace-pre-wrap break-words font-mono text-[12px] leading-6 ${state.ok ? 'text-[var(--fg)]' : 'text-red-600'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
