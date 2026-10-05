'use client'
/**
 * 单个上游供应商的编辑表单。新建和编辑共用。
 *
 * ⚠️ 标识建后锁死:产品分组指着它,改了那些分组就找不到地址。
 */
import { useActionState } from 'react'
import { saveUpstream, deleteUpstream, type UpstreamState } from '@/app/actions/ops-upstreams'

export type UpstreamView = {
  id: string
  displayName: string
  baseUrl: string
  authStyle: string
  note: string
  sortOrder: number
  /** 挂在这个上游上的产品线 */
  groups: { id: string; displayName: string; keyFilled: boolean }[]
}

const input = 'rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]'

export function UpstreamForm({ view, isNew = false }: { view?: UpstreamView; isNew?: boolean }) {
  const [state, action, pending] = useActionState<UpstreamState, FormData>(saveUpstream, undefined)
  const [delState, delAction, deleting] = useActionState<UpstreamState, FormData>(deleteUpstream, undefined)
  const msg = state ?? delState
  const v = view

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{isNew ? '新增上游' : v?.displayName}</h3>
        {!isNew && v && (
          <span className="font-mono text-[12px] text-[var(--muted)]">{v.groups.length} 条产品线在用</span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">标识(建后不可改)</span>
          <input
            name="id"
            defaultValue={v?.id}
            readOnly={!isNew}
            required
            placeholder="anthropic"
            className={`${input} font-mono ${!isNew ? 'text-[var(--muted)]' : ''}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">名字(自己看的)</span>
          <input name="displayName" defaultValue={v?.displayName} required placeholder="Anthropic 官方" className={input} />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] text-[var(--muted)]">根地址(不带路径,末尾不要斜杠)</span>
          <input
            name="baseUrl"
            defaultValue={v?.baseUrl}
            required
            placeholder="https://api.anthropic.com"
            className={`${input} font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] text-[var(--muted)]">key 怎么放进请求头</span>
          <select name="authStyle" defaultValue={v?.authStyle ?? 'bearer'} className={input}>
            <option value="bearer">Authorization: Bearer &lt;key&gt; —— new-api 系、OpenAI 官方</option>
            <option value="x-api-key">x-api-key: &lt;key&gt; —— Anthropic 官方</option>
            <option value="raw">Authorization: &lt;key&gt; —— 部分中转站,不带 Bearer</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">备注(结算方式、联系人…)</span>
          <input name="note" defaultValue={v?.note} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">显示顺序</span>
          <input name="sortOrder" type="number" min={0} defaultValue={v?.sortOrder ?? 50} className={`${input} font-mono`} />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {pending ? '保存中…' : isNew ? '创建' : '保存'}
        </button>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.message}</span>}
      </div>

      {!isNew && v && (
        <button
          type="submit"
          formAction={delAction}
          disabled={deleting}
          className="mt-3 block text-[13px] text-[var(--muted)] underline underline-offset-2"
        >
          删除这个上游
        </button>
      )}
    </form>
  )
}
