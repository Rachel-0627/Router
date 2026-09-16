'use client'
/**
 * 从上游新增模型。**不让你填价格** —— 选一个上游模型,价格自动带过来。
 */
import { useActionState, useState } from 'react'
import { addModelFromUpstream, type ImportState } from '@/app/actions/model-import'
import type { ImportCandidate } from '@/lib/pricing/import-upstream'

export function AddModel({ candidates }: { candidates: ImportCandidate[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(addModelFromUpstream, undefined)
  const [picked, setPicked] = useState('')
  const c = candidates.find((x) => x.upstreamId === picked)

  if (candidates.length === 0) {
    return <p className="text-sm text-[var(--muted)]">上游没有新模型可导入(已有的都上架了)。</p>
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">上游模型</label>
        <select
          name="upstreamId"
          required
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="mt-1.5 w-full max-w-lg rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        >
          <option value="">— 选一个（共 {candidates.length} 个可进货）—</option>
          {candidates.map((x) => (
            <option key={x.upstreamId} value={x.upstreamId}>
              {x.upstreamId} · {x.vendor} · {Object.keys(x.upstreamCny).length} 个分组有货
              {x.listPriceSource === 'missing' ? ' ⚠️无官方价' : ''}
            </option>
          ))}
        </select>
      </div>

      {c && (
        <div className="max-w-lg rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-xs leading-5">
          <div className="text-[var(--muted)]">{c.description || '（上游无描述）'}</div>
          <div className="mt-2">
            官方价来源：
            <span className={c.listPriceSource === 'missing' ? 'text-red-500' : 'text-[var(--accent)]'}>
              {c.listPriceSource === 'upstream' ? '上游自带' : c.listPriceSource === 'openrouter' ? 'OpenRouter' : '拿不到 —— 不能上架'}
            </span>
            {c.listPrice && ` · 输入 $${c.listPrice.input}/M · 输出 $${c.listPrice.output}/M`}
            {c.listPriceTiers?.length ? ` · 有长上下文分档(${c.listPriceTiers[0].minPromptTokens.toLocaleString()} tok)` : ''}
          </div>
          <div className="mt-1 text-[var(--muted)]">
            进货档位：{Object.entries(c.upstreamCny).map(([g, p]) => `${g} ¥${p.input}`).join(' · ')}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-sm font-medium">对外模型 ID</label>
          <input name="modelId" required defaultValue={picked} placeholder="用户请求里写的名字"
            className="mt-1.5 w-56 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium">显示名</label>
          <input name="displayName" required placeholder="GPT-5.6 Terra"
            className="mt-1.5 w-48 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium">分组</label>
          <select name="productGroup" className="mt-1.5 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm">
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">上下文</label>
          <input name="contextWindow" type="number" defaultValue={200000}
            className="mt-1.5 w-32 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">一句介绍（定价页展示）</label>
        <input name="blurb" maxLength={200} className="mt-1.5 w-full max-w-lg rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm" />
      </div>

      <button disabled={pending || !picked}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? '添加中…' : '添加（默认下架状态）'}
      </button>
      {state && <p className={`text-sm ${state.ok ? 'text-[var(--accent)]' : 'text-red-500'}`}>{state.message}</p>}
    </form>
  )
}
