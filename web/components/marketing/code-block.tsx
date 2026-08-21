'use client'
import { useState } from 'react'

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* 剪贴板不可用时静默失败,用户仍可手动选中复制 */
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <span className="font-mono text-xs text-[var(--muted)]">{label ?? 'shell'}</span>
        <button
          onClick={copy}
          className="rounded px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[13px] leading-6">{code}</code>
      </pre>
    </div>
  )
}
