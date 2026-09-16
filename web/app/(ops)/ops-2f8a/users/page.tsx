import { listUsersForOps } from '@/lib/db/queries/ops-users'
import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import { UserActions } from '@/components/ops/user-actions'

export const metadata = { title: 'ops · users', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const usd = (m: number) => `$${(m / 1_000_000).toFixed(2)}`
const date = (d: Date) => new Date(d).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

export default async function OpsUsers() {
  const [rows, me] = await Promise.all([listUsersForOps(), getCurrentUser()])
  const real = rows.filter((r) => !r.email.endsWith('@test.local'))
  const test = rows.length - real.length

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-xl font-semibold">用户</h1>
      <p className="mt-2 text-[var(--muted)]">
        共 {rows.length} 个账号
        {test > 0 && <span> · 其中 {test} 个是测试账号（<code className="font-mono text-xs">*@test.local</code>）</span>}
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[1000px]">
          <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">邮箱</th>
              <th className="px-4 py-3 text-right font-medium">余额</th>
              <th className="px-4 py-3 text-right font-medium">充值/发放</th>
              <th className="px-4 py-3 text-right font-medium">已消费</th>
              <th className="px-4 py-3 text-right font-medium">Key</th>
              <th className="px-4 py-3 text-right font-medium">请求</th>
              <th className="px-4 py-3 text-right font-medium">最后活跃</th>
              <th className="px-4 py-3 text-right font-medium">注册</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={`border-t border-[var(--border)] align-top ${u.status !== 'active' ? 'opacity-55' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/ops-2f8a/users/${u.id}`} className="font-mono text-xs underline underline-offset-2 hover:text-[var(--accent)]">
                      {u.email}
                    </Link>
                    {u.role === 'admin' && (
                      <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[11px] text-[var(--accent)]">管理员</span>
                    )}
                    {u.status !== 'active' && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[11px] text-red-500">已封禁</span>
                    )}
                  </div>
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums ${u.balanceMicroUsd <= 0 ? 'text-[var(--muted)]' : ''}`}>
                  {usd(u.balanceMicroUsd)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{usd(u.toppedUpMicroUsd)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">{usd(u.spentMicroUsd)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{u.keyCount}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--muted)]">{u.requests}</td>
                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                  {u.lastUsedAt ? date(u.lastUsedAt) : '从未'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--muted)]">{date(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <UserActions userId={u.id} email={u.email} status={u.status} isSelf={me?.id === u.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        「充值/发放」是所有正向流水之和（用户付费 + 你手动发的）。余额 = 全部流水求和，没有余额字段。
        点邮箱进详情页看按模型用量、流水和 key。手动发放记为 <code className="font-mono">adjustment</code> 类型，和用户真实付费的 <code className="font-mono">topup</code> 分开，对账时能区分。
      </p>
    </div>
  )
}
