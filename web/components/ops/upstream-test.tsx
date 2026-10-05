'use client'
/**
 * 上游连通性实测面板 —— 选一把 key、填一个模型名、选协议,点一下看结果。
 *
 * 和产品分组解耦:想摸清上游到底有哪些模型、哪把 key 能调什么,
 * 直接填就行,不用先往模型目录里塞假数据。
 */
import { useActionState } from 'react'
import { testUpstream } from '@/app/actions/ops-upstream-test'
import { type SecretState } from '@/app/actions/ops-secrets'

export type KeyChoice = {
  slot: string
  label: string
  configured: boolean
  /** 这把 key 属于哪条产品线 —— 跨组调会一直挂到超时,必须让人一眼看见 */
  groupName?: string
  /** 该产品线的一个真实模型名,拿来当输入框的默认值,省得手打错 */
  sampleModel?: string
  /** 该产品线该用哪种协议 */
  protocol?: string
}

export function UpstreamTest({ keys }: { keys: KeyChoice[] }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(testUpstream, undefined)
  const usable = keys.filter((k) => k.configured)

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <h3 className="font-semibold">连通性实测</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
        发一个 <code className="font-mono">max_tokens=1</code> 的最小请求,花费可忽略。
        用它摸清上游有哪些模型、哪把 key 能调什么 —— 不需要先上架。
      </p>

      {usable.length === 0 ? (
        <p className="mt-4 text-[13px] text-amber-700">先在上面填好上游地址和至少一把 key。</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--muted)]">用哪把 key</span>
              <select
                name="keySlot"
                defaultValue={usable[0]?.slot}
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
              >
                {usable.map((k) => (
                  <option key={k.slot} value={k.slot}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--muted)]">模型名(上游的叫法)</span>
              <input
                name="model"
                autoComplete="off"
                spellCheck={false}
                placeholder="claude-opus-5"
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[14px]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--muted)]">协议</span>
              <select
                name="protocol"
                defaultValue="anthropic"
                className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
              >
                <option value="anthropic">Anthropic 格式</option>
                <option value="openai">OpenAI 格式</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
            >
              {pending ? '测试中…' : '测试'}
            </button>
            <span className="text-[12px] text-[var(--muted)]">
              Claude 系用 Anthropic 格式,GPT 系用 OpenAI 格式
            </span>
          </div>
        </>
      )}

      {state && (
        <p className={`mt-4 text-[13px] leading-6 ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {state.ok ? '✅ ' : '❌ '}
          {state.message}
        </p>
      )}
    </form>
  )
}
