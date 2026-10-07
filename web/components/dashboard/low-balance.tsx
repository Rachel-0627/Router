/**
 * 低余额警示。
 *
 * ⚠️ 为什么这是必需品而不是锦上添花:
 *    加密货币**没法自动续费** —— 没有存卡、没法从用户钱包拉钱。
 *    信用卡时代"余额不足自动充值"能兜住的场景,这里全部兜不住。
 *    用户的编码 Agent 跑到一半余额见底会直接 402 中断,活儿白干,
 *    而他只会记得"这个服务把我坑了"。
 *
 *    所以必须**提前**告诉他,而不是等他撞上 402。
 */
import Link from 'next/link'

export function LowBalance({
  balanceMicroUsd,
  spend7dMicroUsd,
}: {
  balanceMicroUsd: number
  spend7dMicroUsd: number
}) {
  const balance = balanceMicroUsd / 1_000_000

  // 余额为空 —— 最急,直说后果
  if (balanceMicroUsd <= 0) {
    return (
      <Banner tone="danger">
        <strong>Your balance is empty.</strong> API requests will return{' '}
        <code className="font-mono text-[13px]">402</code> until you add credits.{' '}
        <Add />
      </Banner>
    )
  }

  // 还没有用量就预测不了,别用一个瞎猜的天数吓唬人
  if (spend7dMicroUsd <= 0) return null

  const perDay = spend7dMicroUsd / 7
  const days = balanceMicroUsd / perDay
  if (days > 5) return null

  return (
    <Banner tone={days <= 2 ? 'danger' : 'warn'}>
      At your last 7 days of usage, <strong>${balance.toFixed(2)}</strong> lasts about{' '}
      <strong>{days < 1 ? 'less than a day' : `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`}</strong>.{' '}
      Top up before it runs out — <strong>crypto payments cannot auto-recharge</strong>, so a
      long agent run can stop mid-task. <Add />
    </Banner>
  )
}

function Add() {
  return (
    <Link href="/dashboard/billing" className="underline underline-offset-2 hover:opacity-80">
      Add credits
    </Link>
  )
}

function Banner({ tone, children }: { tone: 'warn' | 'danger'; children: React.ReactNode }) {
  const cls =
    tone === 'danger'
      ? 'border-red-500/30 bg-red-500/[0.06] text-red-600'
      : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-700'
  return (
    <div className={`mb-6 rounded-lg border px-4 py-3 text-[14px] leading-6 ${cls}`} role="status">
      {children}
    </div>
  )
}
