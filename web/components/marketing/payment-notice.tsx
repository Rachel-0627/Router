/**
 * 付款方式说明。
 *
 * ⚠️ 为什么必须在**注册之前**就说清楚:
 *    不说的话,用户要走完「注册 → 建 key → 调 API → 撞 402 → 点充值」
 *    才发现只能用加密货币 —— 那是最差的发现时机,前面所有投入都白费,
 *    而且会让人觉得被耍。
 *
 *    把它当筛选器而不是遮羞布:手里有 USDT 的人看到会觉得"正好",
 *    没有的人早点离开,也好过浪费双方时间。
 */
import { site } from '@/lib/site'

export function PaymentNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[14px] leading-6 text-[var(--muted)]">
        <strong className="text-[var(--fg)]">Paid in USDT (TRC-20).</strong> Prepaid credits from $
        {site.minTopupUsd}, no subscription. Card payments are not available yet.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="text-sm font-semibold">How payment works</h3>
      <ul className="mt-3 space-y-2.5 text-sm leading-6 text-[var(--muted)]">
        <li>
          <strong className="text-[var(--fg)]">USDT on the TRON network (TRC-20).</strong> You get a
          wallet address and a QR code at checkout — send from any exchange or wallet. Credits land
          automatically, usually within a few minutes. <strong>Cards are not supported yet.</strong>
        </li>
        <li>
          <strong className="text-[var(--fg)]">${site.minTopupUsd} minimum.</strong> That floor comes
          from the payment network, not from us. A TRC-20 transfer costs you roughly $1 in network
          fees no matter the size, so smaller top-ups are poor value for you.
        </li>
        <li>
          <strong className="text-[var(--fg)]">We credit what actually arrives.</strong> Exchanges
          deduct a withdrawal fee, so a $20 invoice often lands as slightly less. Your balance
          reflects the amount received — a payment is never rejected for being a little short.
        </li>
        <li>
          <strong className="text-[var(--fg)]">Crypto cannot auto-recharge.</strong> There is no
          stored card to charge, so we cannot top you up automatically. We warn you in the dashboard
          before your balance runs out — top up early so a long agent run does not stop mid-task.
        </li>
        <li>
          <strong className="text-[var(--fg)]">Refunds are manual for crypto.</strong> Blockchain
          transfers cannot be reversed. We still refund unused credits within 30 days, sent back on
          the same network minus the network fee —{' '}
          <a href="/legal/refund" className="underline underline-offset-2 hover:text-[var(--fg)]">
            full policy
          </a>
          .
        </li>
      </ul>
    </div>
  )
}
