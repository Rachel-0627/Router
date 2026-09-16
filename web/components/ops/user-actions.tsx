'use client'
/** 用户行操作:发额度 / 封禁。发额度强制填原因,会写进流水。 */
import { useActionState, useState, useTransition } from 'react'
import { grantCredits, setUserStatus, type GrantState } from '@/app/actions/ops-users'

export function UserActions({
  userId, email, status, isSelf,
}: { userId: string; email: string; status: string; isSelf: boolean }) {
  const [open, setOpen] = useState(false)
  const [grantState, grantAction, granting] = useActionState<GrantState, FormData>(grantCredits, undefined)
  const [statusMsg, setStatusMsg] = useState<GrantState>(undefined)
  const [pending, start] = useTransition()

  return (
    <div className="text-right">
      <div className="flex justify-end gap-3">
        <button onClick={() => setOpen((v) => !v)} className="text-xs underline underline-offset-2">
          {open ? '收起' : '发额度'}
        </button>
        {!isSelf && (
          <button
            disabled={pending}
            onClick={() => {
              const fd = new FormData()
              fd.set('userId', userId)
              fd.set('next', status === 'active' ? 'suspended' : 'active')
              start(async () => setStatusMsg(await setUserStatus(fd)))
            }}
            className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
          >
            {status === 'active' ? '封禁' : '解封'}
          </button>
        )}
      </div>

      {open && (
        <form action={grantAction} className="mt-2 space-y-2 rounded-md border border-[var(--border)] p-3 text-left">
          <input type="hidden" name="userId" value={userId} />
          <div className="text-xs text-[var(--muted)]">给 {email} 发额度（负数为扣除）</div>
          <div className="flex gap-2">
            <input
              name="amountUsd" type="number" step="0.01" required placeholder="20"
              className="w-24 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-right font-mono text-xs"
            />
            <input
              name="reason" required maxLength={120} placeholder="原因，如：内测赠送"
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs"
            />
            <button
              disabled={granting}
              className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {granting ? '…' : '发放'}
            </button>
          </div>
          <p className="text-[11px] leading-4 text-[var(--muted)]">
            会写进流水（类型 adjustment，带你的邮箱和原因），对账时可追溯。
          </p>
        </form>
      )}

      {(grantState || statusMsg) && (
        <p className={`mt-1.5 max-w-xs text-left text-xs leading-5 ${(grantState ?? statusMsg)!.ok ? 'text-[var(--accent)]' : 'text-red-500'}`}>
          {(grantState ?? statusMsg)!.message}
        </p>
      )}
    </div>
  )
}
