'use client'
/** 注册/登录共用的表单。两者字段完全一样,只有文案和 action 不同。 */
import { useActionState } from 'react'
import type { FormState } from '@/app/actions/auth'

type Action = (prev: FormState, data: FormData) => Promise<FormState>

export function CredentialsForm({
  action,
  submitLabel,
  passwordHint,
}: {
  action: Action
  submitLabel: string
  passwordHint?: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined)

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2.5 text-sm text-red-500"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {state?.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-500">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
        {state?.fieldErrors?.password ? (
          <p className="mt-1 text-xs text-red-500">{state.fieldErrors.password[0]}</p>
        ) : passwordHint ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{passwordHint}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Working…' : submitLabel}
      </button>
    </form>
  )
}
