'use client'
/**
 * 上游连通性测试 —— 用当前配置真发一个最小请求(max_tokens=1)。
 * 填完当场知道通不通,不用等真实用户来踩雷。
 */
import { useActionState } from 'react'
import { testUpstream, type SecretState } from '@/app/actions/ops-secrets'

export function UpstreamTest({ group, label }: { group: 'claude' | 'codex'; label: string }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(testUpstream, undefined)

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="group" value={group} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--card)] disabled:opacity-50"
      >
        {pending ? '测试中…' : `测试 ${label} 连通性`}
      </button>
      {state && (
        <span className={`text-[13px] ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {state.ok ? '✅ ' : '❌ '}
          {state.message}
        </span>
      )}
    </form>
  )
}
