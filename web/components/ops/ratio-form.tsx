'use client'
/** 改倍率。滑动时实时显示各模型的售价和兜底毛利,保存前就能看到后果。 */
import { useActionState, useState } from 'react'
import { updateGroupSettings, type SettingsState } from '@/app/actions/ops-settings'

export type RatioPreviewRow = { modelId: string; listInput: number; costInput: number; worstAt: (r: number) => number | null }

export function RatioForm({
  groupId,
  groupName,
  ratio,
  status,
  rows,
}: {
  groupId: string
  groupName: string
  ratio: number
  status: string
  /** 预计算好的:每个模型的官方价和最贵兜底档成本(美元/百万 token) */
  rows: { modelId: string; active: boolean; listInput: number; worstCostInput: number | null }[]
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateGroupSettings, undefined)
  const [r, setR] = useState(ratio)

  const worst = (m: (typeof rows)[number]) => {
    if (m.worstCostInput === null) return null
    const sell = m.listInput * r
    return sell === 0 ? null : ((sell - m.worstCostInput) / sell) * 100
  }
  const danger = rows.some((m) => m.active && (worst(m) ?? 100) < 5)

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{groupName}</h3>
        <label className="flex items-center gap-2">
          <span className="text-[var(--muted)]">上架状态</span>
          <select name="status" defaultValue={status} className="rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5">
            <option value="live">已上架 (可购买)</option>
            <option value="pending">未上架 (只展示)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <input
          type="range" min={0.05} max={1} step={0.05} value={r}
          onChange={(e) => setR(Number(e.target.value))}
          className="h-2 w-64 accent-[var(--accent)]"
        />
        <input
          name="ratio" type="number" min={0.05} max={1} step={0.01} value={r}
          onChange={(e) => setR(Number(e.target.value))}
          className="w-24 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-right font-mono"
        />
        <span className="font-mono text-lg">
          官方价的 <strong>{Math.round(r * 100)}%</strong>
          <span className="ml-2 text-[var(--muted)]">(便宜 {Math.round((1 - r) * 100)}%)</span>
        </span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-md border border-[var(--border)]">
        <table className="w-full min-w-[520px]">
          <thead className="bg-[var(--card)] text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">模型</th>
              <th className="px-3 py-2 text-right font-medium">官方</th>
              <th className="px-3 py-2 text-right font-medium">改后售价</th>
              <th className="px-3 py-2 text-right font-medium">兜底毛利</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const w = worst(m)
              const bad = m.active && (w ?? 100) < 5
              return (
                <tr key={m.modelId} className={`border-t border-[var(--border)] ${m.active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.modelId}{!m.active && <span className="ml-1 text-[var(--muted)]">(下架)</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-[var(--muted)]">${m.listInput}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">${(m.listInput * r).toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${bad ? 'font-semibold text-red-500' : ''}`}>
                    {w === null ? '—' : `${w.toFixed(1)}%`}{bad && ' ⚠️'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {danger && (
        <p className="mt-3 text-red-500">
          ⚠️ 这个倍率下有在售模型的兜底毛利低于 5% —— 上游一降级就在倒贴，保存会被拒绝。
        </p>
      )}

      <button
        disabled={pending}
        className="mt-5 rounded-md bg-[var(--accent)] px-5 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? '保存中…' : '保存'}
      </button>
      {state && <p className={`mt-3 leading-6 ${state.ok ? 'text-[var(--accent)]' : 'text-red-500'}`}>{state.message}</p>}
    </form>
  )
}
