import { fundSafety, business, userStats, orderStats } from '@/lib/db/queries/ops'

export const metadata = { title: 'ops', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const usd = (micro: number) => `$${(micro / 1e6).toFixed(2)}`

function Card({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-5 ${warn ? 'border-red-500/40 bg-red-500/[0.04]' : 'border-[var(--border)]'}`}>
      <div className="text-xs tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-semibold ${warn ? 'text-red-500' : ''}`}>{value}</div>
      {hint && <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{hint}</div>}
    </div>
  )
}

function Pending({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] p-5">
      <div className="text-xs tracking-wide text-[var(--muted)]">{what}</div>
      <div className="mt-2 font-mono text-2xl font-semibold text-[var(--muted)]">—</div>
      <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{why}</div>
    </div>
  )
}

export default async function Ops() {
  const [funds, today, month, usersAgg, orders] = await Promise.all([
    fundSafety(), business(0), business(30), userStats(), orderStats(),
  ])
  const broke = funds.disposableMicro < 0

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-xl font-semibold">经营总览</h1>

      <h2 className="mt-8 text-lg font-semibold">💰 资金安全</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card
          label="可支配现金"
          value={usd(funds.disposableMicro)}
          warn={broke}
          hint={broke ? '⚠️ 负数 = 你已经在动用户的钱,立刻停止提现' : '= 已收现金 − 用户未消耗余额'}
        />
        <Card label="已收现金" value={usd(funds.cashMicro)} hint="已支付订单合计" />
        <Card label="用户未消耗余额" value={usd(funds.owedMicro)} hint="这笔钱不是你的,用户随时可退" />
      </div>

      <h2 className="mt-10 text-lg font-semibold">📈 经营</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Card label="今日营收" value={usd(today.revenue)} hint={`${today.requests} 次请求`} />
        <Card label="今日毛利" value={usd(today.grossMicro)} hint={`毛利率 ${today.grossPct.toFixed(1)}%`} />
        <Card label="30 日营收" value={usd(month.revenue)} hint={`成本 ${usd(month.cost)}`} />
        <Card label="30 日毛利" value={usd(month.grossMicro)} hint={`毛利率 ${month.grossPct.toFixed(1)}%`} />
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        ⚠️ 成本按主力分组(VIP)计算。降级到默认分组时真实成本翻倍,此处会低估 —— 见 lib/gateway/meter.ts
      </p>

      <h2 className="mt-10 text-lg font-semibold">👤 用户</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Card label="总用户" value={String(usersAgg.total)} />
        <Card label="近 7 日新增" value={String(usersAgg.new7d)} />
        <Card label="付费用户" value={String(usersAgg.paying)} />
        <Card label="付费转化率" value={`${usersAgg.conversionPct.toFixed(1)}%`} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">💳 订单</h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">还没有订单。</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--card)] text-left text-xs text-[var(--muted)]">
              <tr><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">笔数</th><th className="px-4 py-3 text-right">金额</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.status} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono text-xs">{o.status}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{o.count}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">${(o.cents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold">⏳ 还没接上的</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Pending what="📦 上游备货天数" why="需要 new-api 接上真实上游后,才能读到上游余额和日均消耗" />
        <Pending what="🔌 渠道健康" why="需要 ops/channel-health 探测脚本 + VPS 上的 new-api 渠道配置" />
        <Pending what="⚠️ 拒付率" why="需要支付商接通并产生真实交易后才有数据" />
      </div>
    </div>
  )
}
