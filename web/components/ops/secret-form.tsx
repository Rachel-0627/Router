'use client'
/**
 * 单个密钥槽位的填写框。
 *
 * ⚠️ 已保存的值**永远不回显**,只显示尾号。要换就重填一遍 ——
 *    页面上能看到明文,就意味着浏览器历史、截图、肩窥都能看到。
 */
import { useActionState } from 'react'
import { saveSecret, removeSecret, type SecretState } from '@/app/actions/ops-secrets'

export type SlotView = {
  slot: string
  label: string
  hint: string
  secret: boolean
  kind: 'upstream' | 'group' | 'payment'
  configured: boolean
  source: 'db' | 'env' | 'none'
  last4: string | null
  updatedAt: string | null
  stale: boolean
  unreadable: boolean
}

function Badge({ s }: { s: SlotView }) {
  if (s.unreadable) return <Tag tone="bad">解不开</Tag>
  if (s.stale) return <Tag tone="warn">待重新加密</Tag>
  if (s.source === 'db') return <Tag tone="ok">已配置</Tag>
  if (s.source === 'env') return <Tag tone="warn">来自环境变量</Tag>
  return <Tag tone="muted">未配置</Tag>
}

function Tag({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-emerald-500/12 text-emerald-600',
    warn: 'bg-amber-500/15 text-amber-700',
    bad: 'bg-red-500/12 text-red-600',
    muted: 'bg-[var(--border)] text-[var(--muted)]',
  }[tone]
  return <span className={`rounded px-2 py-0.5 font-mono text-[12px] ${cls}`}>{children}</span>
}

export function SecretForm({ view }: { view: SlotView }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(saveSecret, undefined)
  const [delState, delAction, deleting] = useActionState<SecretState, FormData>(removeSecret, undefined)
  const msg = state ?? delState

  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{view.label}</h3>
          <code className="font-mono text-[12px] text-[var(--muted)]">{view.slot}</code>
        </div>
        <div className="flex items-center gap-2">
          <Badge s={view} />
          {view.last4 && view.secret && (
            <span className="font-mono text-[13px] text-[var(--muted)]">••••{view.last4}</span>
          )}
        </div>
      </div>

      <p className="mt-2.5 text-[13px] leading-6 text-[var(--muted)]">{view.hint}</p>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="slot" value={view.slot} />
        <input
          name="value"
          type={view.secret ? 'password' : 'text'}
          autoComplete="off"
          spellCheck={false}
          placeholder={view.configured ? '填新值以替换' : '粘贴到这里'}
          className="min-w-[280px] flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[14px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {pending ? '保存中…' : '保存'}
        </button>
      </form>

      {view.source === 'db' && (
        <form action={delAction} className="mt-2">
          <input type="hidden" name="slot" value={view.slot} />
          <button type="submit" disabled={deleting} className="text-[13px] text-[var(--muted)] underline underline-offset-2">
            删除(退回读环境变量)
          </button>
        </form>
      )}

      {view.updatedAt && (
        <p className="mt-2 text-[12px] text-[var(--muted)]">最后更新 {view.updatedAt}</p>
      )}
      {msg && (
        <p className={`mt-3 text-[13px] ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.message}</p>
      )}
    </div>
  )
}
