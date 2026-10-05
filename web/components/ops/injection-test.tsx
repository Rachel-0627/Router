'use client'
/**
 * 注入验证面板 —— 开卖前的硬门槛。
 *
 * Claude 那条线就栽在这上面:上游会塞自己的 system prompt,把用户的覆盖掉。
 * 不先测就上架,等于把坑留给付费用户踩。
 */
import { useActionState, useState } from 'react'
import { runInjectionTest, type InjectionState } from '@/app/actions/ops-injection-test'
import type { KeyChoice } from './upstream-test'

export function InjectionTest({ keys }: { keys: KeyChoice[] }) {
  const [state, action, pending] = useActionState<InjectionState, FormData>(runInjectionTest, undefined)
  const usable = keys.filter((k) => k.configured)
  // 选哪把 key 就带出哪条线的模型和协议 —— 跨组搭配会一直挂到超时,
  // 与其让人踩进去再报错,不如一开始就填对
  const [picked, setPicked] = useState(usable[0]?.slot ?? '')
  const cur = usable.find((k) => k.slot === picked) ?? usable[0]
  if (usable.length === 0) return null

  return (
    <form action={action} className="rounded-lg border border-[var(--border)] p-5">
      <h3 className="font-semibold">注入验证（开卖前必做）</h3>
      <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
        发三个探针，看上游会不会偷偷塞自己的 system prompt 把用户的覆盖掉。
        <strong>Claude 那条线就栽在这上面</strong> —— 被覆盖的话只能卖给编码 Agent 场景，
        通用场景会答非所问。三个请求各 ≤120 token，花费可忽略。
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">用哪把 key</span>
          <select
            name="keySlot"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
          >
            {usable.map((k) => (
              <option key={k.slot} value={k.slot}>
                {k.groupName ? `${k.groupName} 组` : k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">模型名</span>
          <input
            key={picked}
            name="model"
            autoComplete="off"
            spellCheck={false}
            defaultValue={cur?.sampleModel ?? ''}
            placeholder="模型名"
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[14px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--muted)]">协议</span>
          <select key={picked} name="protocol" defaultValue={cur?.protocol ?? 'openai'} className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]">
            <option value="openai">OpenAI 格式</option>
            <option value="anthropic">Anthropic 格式</option>
          </select>
        </label>
      </div>

      <button type="submit" disabled={pending} className="mt-4 rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50">
        {pending ? '跑三个探针中…（约 10 秒）' : '开始验证'}
      </button>

      {state && (
        <div className="mt-5">
          <p className={`text-[14px] font-medium leading-6 ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {state.message}
          </p>
          {state.probes?.map((p) => (
            <div key={p.name} className="mt-4 rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="text-[13px] font-semibold">{p.name}</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">问:{p.question}</div>
              <div className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-6">{p.answer}</div>
              <div className="mt-2 text-[12px] text-[var(--muted)]">{p.verdict}</div>
            </div>
          ))}
        </div>
      )}
    </form>
  )
}
