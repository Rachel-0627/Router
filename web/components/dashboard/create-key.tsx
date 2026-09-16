'use client'
/**
 * 建 key 表单 + 一次性明文展示。
 * 明文只在 action 返回值里存在,不落库也不进 URL,刷新即消失。
 */
import { useActionState, useState } from 'react'
import { createKey, type CreateKeyState } from '@/app/actions/keys'

type GroupOption = { id: string; displayName: string; blurb: string }

export function CreateKey({ groups }: { groups: GroupOption[] }) {
  const [state, formAction, pending] = useActionState<CreateKeyState, FormData>(createKey, undefined)
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent)]/[0.04] p-5">
        <h3 className="text-sm font-semibold">
          {state.group} key created — copy it now
        </h3>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          This is the only time we can show you this key. We store a hash, not the key itself.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-[14px]">
            {state.plaintext}
          </code>
          <button
            onClick={() => copy(state.plaintext)}
            className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button
          onClick={() => location.reload()}
          className="mt-4 text-sm text-[var(--muted)] underline underline-offset-2 hover:text-[var(--fg)]"
        >
          I&apos;ve saved it — done
        </button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {groups.length > 1 && (
        <div className="w-full">
          <span className="block text-sm font-medium">Model group</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.map((g, i) => (
              <label
                key={g.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent)]/[0.04]"
              >
                <input type="radio" name="group" value={g.id} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="font-medium">{g.displayName}</span>
                  <span className="block text-xs text-[var(--muted)]">{g.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            A key only works with models in its group. You can create keys for each.
          </p>
        </div>
      )}
      {groups.length === 1 && <input type="hidden" name="group" value={groups[0].id} />}
      <div className="min-w-[220px] flex-1">
        <label htmlFor="name" className="block text-sm font-medium">
          New key name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          placeholder="e.g. laptop — Claude Code"
          className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create key'}
      </button>
      {state?.ok === false && (
        <p role="alert" className="w-full text-sm text-red-500">
          {state.error}
        </p>
      )}
    </form>
  )
}
