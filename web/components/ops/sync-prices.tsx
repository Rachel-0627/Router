'use client'
import { useState, useTransition } from 'react'
import { syncPricesFromUpstream, type ModelActionState } from '@/app/actions/models'

export function SyncPrices() {
  const [msg, setMsg] = useState<ModelActionState>(undefined)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        onClick={() => start(async () => setMsg(await syncPricesFromUpstream()))}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--card)] disabled:opacity-60"
      >
        {pending ? '同步中…' : '从上游同步价格'}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? 'text-[var(--accent)]' : 'text-red-500'}`}>{msg.message}</span>}
    </div>
  )
}
