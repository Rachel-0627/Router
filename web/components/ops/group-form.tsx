'use client'
/**
 * 单个产品分组的编辑表单。新建和编辑共用 —— 差别只在标识能不能改。
 *
 * ⚠️ 标识(groupId)建后锁死:已经发出去的 API key 绑着它,
 *    改了那些 key 全部作废,而用户完全不知道发生了什么。
 */
import { useActionState } from 'react'
import { saveGroup, deleteGroup, type GroupState } from '@/app/actions/ops-groups'

export type GroupView = {
  id: string
  displayName: string
  blurb: string
  ratio: number
  status: string
  protocol: string
  secretSlot: string
  sortOrder: number
  modelCount: number
  keyCount: number
}

const input = 'rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]'

export function GroupForm({ view, isNew = false }: { view?: GroupView; isNew?: boolean }) {
  const [state, action, pending] = useActionState<GroupState, FormData>(saveGroup, undefined)
  const [delState, delAction, deleting] = useActionState<GroupState, FormData>(deleteGroup, undefined)
  const msg = state ?? delState
  const v = view

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{isNew ? '新建分组' : v?.displayName}</h3>
        {!isNew && v && (
          <span className="font-mono text-[12px] text-[var(--muted)]">
            {v.modelCount} 个模型 · {v.keyCount} 把有效 key
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">标识(建后不可改)</span>
          <input
            name="groupId"
            defaultValue={v?.id}
            readOnly={!isNew}
            required
            placeholder="glm"
            className={`${input} font-mono ${!isNew ? 'text-[var(--muted)]' : ''}`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">显示名(用户看到的)</span>
          <input name="displayName" defaultValue={v?.displayName} required placeholder="GLM" className={input} />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] text-[var(--muted)]">一句话介绍</span>
          <input
            name="blurb"
            defaultValue={v?.blurb}
            placeholder="Zhipu GLM models for coding agents."
            className={input}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">售价倍率(0.8 = 官方价八折)</span>
          <input
            name="ratio"
            type="number"
            step={0.01}
            min={0.05}
            max={1}
            defaultValue={v?.ratio ?? 0.8}
            required
            className={`${input} font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">上架状态</span>
          <select name="status" defaultValue={v?.status ?? 'pending'} className={input}>
            <option value="live">已上架(可购买)</option>
            <option value="pending">未上架(只展示)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">转发协议</span>
          <select name="protocol" defaultValue={v?.protocol ?? 'anthropic'} className={input}>
            <option value="anthropic">Anthropic 格式(Claude 系)</option>
            <option value="openai">OpenAI 格式(GPT / 国产模型多数)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">显示顺序(小的在前)</span>
          <input name="sortOrder" type="number" min={0} defaultValue={v?.sortOrder ?? 50} className={`${input} font-mono`} />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[12px] text-[var(--muted)]">上游 key 槽位(留空自动生成)</span>
          <input
            name="secretSlot"
            defaultValue={v?.secretSlot}
            placeholder="留空 = NEWAPI_SERVICE_KEY_<标识大写>"
            className={`${input} font-mono`}
          />
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
        <div className="mt-3">
          <button
            type="submit"
            formAction={delAction}
            disabled={deleting}
            className="text-[13px] text-[var(--muted)] underline underline-offset-2"
          >
            删除这个分组
          </button>
        </div>
      )}
    </form>
  )
}
