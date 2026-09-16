import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getUserDetail } from '@/lib/db/queries/ops-users'
import { getCurrentUser } from '@/lib/auth'
import { UserActions } from '@/components/ops/user-actions'

export const metadata = { title: 'ops · user', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const usd = (m: number) => `${m < 0 ? '−' : ''}$${Math.abs(m / 1_000_000).toFixed(Math.abs(m) > 0 && Math.abs(m) < 10_000 ? 4 : 2)}`
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n))
const dt = (d: Date | null) =>
  d ? new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const LEDGER_LABEL: Record<string, string> = {
  topup: '用户充值', usage: 'API 消费', refund: '退款', adjustment: '手动调整',
}

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [d, me] = await Promise.all([getUserDetail(id), getCurrentUser()])
  if (!d) notFound()

  const balance = d.ledger.reduce((s, r) => s + r.deltaMicroUsd, 0)
  const revenue = d.byModel.reduce((s, m) => s + m.revenue, 0)
  const cost = d.byModel.reduce((s, m) => s + m.cost, 0)
  const requests = d.byModel.reduce((s, m) => s + m.requests, 0)
  const promptTotal = d.byModel.reduce((s, m) => s + m.input + m.cacheRead + m.cacheWrite, 0)
  const cacheRead = d.byModel.reduce((s, m) => s + m.cacheRead, 0)
  const hit = promptTotal > 0 ? (cacheRead / promptTotal) * 100 : 0

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/ops-2f8a/users" className="text-[var(--muted)] hover:text-[var(--fg)]">← 用户列表</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold">{d.user.email}</h1>
          <p className="mt-1.5 text-[var(--muted)]">
            {d.user.role === 'admin' && <span className="mr-2 rounded bg-[var(--accent)]/12 px-1.5 py-0.5 text-[11px] text-[var(--accent)]">管理员</span>}
            {d.user.status !== 'active' && <span className="mr-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-500">已封禁</span>}
            注册于 {dt(d.user.createdAt)}
          </p>
        </div>
        <UserActions userId={d.user.id} email={d.user.email} status={d.user.status} isSelf={me?.id === d.user.id} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          { l: '余额', v: usd(balance), h: '流水求和' },
          { l: '累计消费', v: usd(revenue), h: `${requests} 次请求` },
          { l: '我们的成本', v: usd(cost), h: revenue > 0 ? `毛利 ${(((revenue - cost) / revenue) * 100).toFixed(1)}%` : '—' },
          { l: '缓存命中率', v: `${hit.toFixed(1)}%`, h: `${compact(cacheRead)} / ${compact(promptTotal)} 输入 token` },
        ].map((c) => (
          <div key={c.l} className="rounded-lg border border-[var(--border)] p-5">
            <div className="text-xs tracking-wide text-[var(--muted)]">{c.l}</div>
            <div className="mt-2 font-mono text-2xl font-semibold">{c.v}</div>
            <div className="mt-1.5 text-xs text-[var(--muted)]">{c.h}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">按模型</h2>
      {d.byModel.length === 0 ? (
        <p className="mt-3 text-[var(--muted)]">还没有用量。</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[760px]">
            <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">模型</th>
                <th className="px-4 py-3 text-right font-medium">请求</th>
                <th className="px-4 py-3 text-right font-medium">输入</th>
                <th className="px-4 py-3 text-right font-medium">缓存读</th>
                <th className="px-4 py-3 text-right font-medium">输出</th>
                <th className="px-4 py-3 text-right font-medium">他花了</th>
                <th className="px-4 py-3 text-right font-medium">我们成本</th>
                <th className="px-4 py-3 text-right font-medium">毛利</th>
              </tr>
            </thead>
            <tbody>
              {d.byModel.map((m) => (
                <tr key={m.model} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono text-xs">{m.model}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{m.requests}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{compact(m.input)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--accent)]">{compact(m.cacheRead)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{compact(m.output)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{usd(m.revenue)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{usd(m.cost)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {m.revenue > 0 ? `${(((m.revenue - m.cost) / m.revenue) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">API Key</h2>
          {d.keys.length === 0 ? (
            <p className="mt-3 text-[var(--muted)]">没有 key。</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {d.keys.map((k) => (
                <li key={k.id} className="rounded-lg border border-[var(--border)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{k.name}</span>
                    <span className="font-mono text-xs text-[var(--muted)]">{k.productGroup}</span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">{k.keyPrefix}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {k.status === 'active' ? '启用中' : '已禁用'} · 最后使用 {dt(k.lastUsedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold">流水（最近 50 条）</h2>
          {d.ledger.length === 0 ? (
            <p className="mt-3 text-[var(--muted)]">没有流水。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full">
                <tbody>
                  {d.ledger.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-3 py-2.5 font-mono text-xs text-[var(--muted)]">{dt(r.createdAt)}</td>
                      <td className="px-3 py-2.5 text-xs">{LEDGER_LABEL[r.type] ?? r.type}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--muted)]">{r.note ?? '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${r.deltaMicroUsd >= 0 ? 'text-[var(--accent)]' : ''}`}>
                        {usd(r.deltaMicroUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
