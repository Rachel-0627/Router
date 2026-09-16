'use client'
/** 模型行上的操作按钮。结果消息回显在行下方,不用弹窗。 */
import { useState, useTransition } from 'react'
import { setModelStatus, deleteModel, setModelRatio, type ModelActionState } from '@/app/actions/models'

export function ModelRowActions({
  id, modelId, status, ratioOverride, groupRatio,
}: {
  id: string
  modelId: string
  status: string
  /** 模型自己的倍率,空表示跟分组走 */
  ratioOverride: number | null
  groupRatio: number
}) {
  const [msg, setMsg] = useState<ModelActionState>(undefined)
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(ratioOverride === null ? '' : String(ratioOverride))

  const run = (fn: (fd: FormData) => Promise<ModelActionState>, extra?: Record<string, string>) => {
    const fd = new FormData()
    fd.set('id', id)
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v)
    start(async () => setMsg(await fn(fd)))
  }

  return (
    <div className="text-right">
      <div className="flex justify-end gap-3">
        <button
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
          className="text-xs underline underline-offset-2 disabled:opacity-50"
        >
          {editing ? '收起' : '调价'}
        </button>
        <button
          disabled={pending}
          onClick={() => run(setModelStatus, { next: status === 'active' ? 'disabled' : 'active' })}
          className="text-xs underline underline-offset-2 disabled:opacity-50"
        >
          {status === 'active' ? '下架' : '上架'}
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm(`确定删除 ${modelId}?有用量记录的会被拒绝。`)) run(deleteModel)
          }}
          className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
        >
          删除
        </button>
      </div>
      {editing && (
        <div className="mt-2 rounded-md border border-[var(--border)] p-3 text-left">
          <div className="text-xs text-[var(--muted)]">
            单独设倍率（留空 = 跟分组走，现在是 ×{groupRatio}）
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="number" step="0.01" min={0.05} max={1} value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={String(groupRatio)}
              className="w-24 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-right font-mono text-xs"
            />
            <button
              disabled={pending}
              onClick={() => run(setModelRatio, { ratio: val })}
              className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              保存
            </button>
            {ratioOverride !== null && (
              <button
                disabled={pending}
                onClick={() => { setVal(''); run(setModelRatio, { ratio: '' }) }}
                className="shrink-0 text-xs underline underline-offset-2"
              >
                改回跟随
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
            1 = 官方原价。太低会被赔本护栏拦下。
          </p>
        </div>
      )}

      {msg && (
        <p className={`mt-1.5 max-w-xs text-left text-[12px] leading-4 ${msg.ok ? 'text-[var(--accent)]' : 'text-red-500'}`}>
          {msg.message}
        </p>
      )}
    </div>
  )
}
