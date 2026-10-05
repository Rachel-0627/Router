'use client'
/**
 * 上游连通性测试 —— 用当前配置真发一个最小请求(max_tokens=1)。
 *
 * 留了个自定义模型名的输入框:用来验证上游有没有某个我们还没上架的型号,
 * 省得为了试一下先往目录里加一条假数据。留空就按目录里最便宜的三个依次试。
 */
import { useActionState } from 'react'
import { testUpstream } from '@/app/actions/ops-upstream-test'
import { type SecretState } from '@/app/actions/ops-secrets'

export function UpstreamTest({ group, label }: { group: 'claude' | 'codex'; label: string }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(testUpstream, undefined)

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-4">
      <input type="hidden" name="group" value={group} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--card)] disabled:opacity-50"
        >
          {pending ? '测试中…' : `测试 ${label}`}
        </button>
        <input
          name="model"
          autoComplete="off"
          spellCheck={false}
          placeholder="模型名(留空=自动试目录里最便宜的 3 个)"
          className="min-w-[260px] flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[13px]"
        />
      </div>
      {state && (
        <p className={`mt-3 text-[13px] leading-6 ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {state.ok ? '✅ ' : '❌ '}
          {state.message}
        </p>
      )}
    </form>
  )
}
