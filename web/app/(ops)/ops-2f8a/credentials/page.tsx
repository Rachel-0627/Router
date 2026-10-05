import { allSlots } from '@/lib/secrets/slots'
import { slotStatuses } from '@/lib/secrets/store'
import { currentFingerprint, hasKek, hasOldKek } from '@/lib/secrets/keys'
import { SecretForm, type SlotView } from '@/components/ops/secret-form'
import { UpstreamTest } from '@/components/ops/upstream-test'
import { KekPanel } from '@/components/ops/kek-panel'

export const metadata = { title: 'ops · credentials', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('zh-CN') : null)

export default async function OpsCredentials() {
  const [defs, statuses] = await Promise.all([allSlots(), slotStatuses()])
  const bySlot = new Map(statuses.map((s) => [s.slot, s]))

  const views: SlotView[] = defs.map((def) => {
    const st = bySlot.get(def.slot)
    return {
      slot: def.slot,
      label: def.label,
      hint: def.hint,
      secret: def.secret,
      kind: def.kind,
      configured: st?.configured ?? false,
      source: st?.source ?? 'none',
      last4: st?.last4 ?? null,
      updatedAt: fmt(st?.updatedAt ?? null),
      stale: st?.stale ?? false,
      unreadable: st?.unreadable ?? false,
    }
  })

  const upstream = views.filter((v) => v.kind === 'upstream')
  const groupKeys = views.filter((v) => v.kind === 'group')
  const payment = views.filter((v) => v.kind === 'payment')

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-xl font-semibold">密钥配置</h1>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        上游 key 和支付 key 填在这里，加密后存数据库，<strong>保存即生效，不用重新部署</strong>。
        已保存的值只显示尾号，要换就重填一遍。
      </p>

      <div className="mt-6">
        <KekPanel
          status={{
            configured: hasKek(),
            fingerprint: currentFingerprint(),
            hasOld: hasOldKek(),
            staleCount: statuses.filter((s) => s.stale).length,
            unreadableCount: statuses.filter((s) => s.unreadable).length,
          }}
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold">上游</h2>
      <div className="mt-4 space-y-4">
        {upstream.map((v) => (
          <SecretForm key={v.slot} view={v} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">各产品分组的 key</h2>
      <p className="mt-1.5 text-[13px] text-[var(--muted)]">
        每个产品分组一把。<a href="/ops-2f8a/groups" className="underline underline-offset-2">在分组管理里</a>
        新开一条产品线，这里会自动多一个框。
      </p>
      <div className="mt-4 space-y-4">
        {groupKeys.map((v) => (
          <SecretForm key={v.slot} view={v} />
        ))}
      </div>

      <div className="mt-6">
        <UpstreamTest
          keys={views
            .filter((v) => v.secret && v.kind !== 'payment')
            .map((v) => ({ slot: v.slot, label: v.label, configured: v.configured }))}
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold">支付</h2>
      <div className="mt-4 space-y-4">
        {payment.map((v) => (
          <SecretForm key={v.slot} view={v} />
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold">三件要知道的事</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[var(--muted)]">
          <li>
            <strong>库里只存密文。</strong>加密钥匙放在 Vercel 环境变量 <code className="font-mono">SECRETS_KEK</code>，
            故意不进数据库 —— 否则库被导出时钥匙和锁一起泄露。
          </li>
          <li>
            <strong>这把钥匙丢了要重填一次。</strong>任何加密方案都绕不过这点，值得单独备份一下。
            真丢了也不会停摆：没填的槽位会自动退回读环境变量。
          </li>
          <li>
            <strong>它和登录密钥是分开的。</strong>换 <code className="font-mono">AUTH_SECRET</code>（怀疑会话泄露时该做的事）
            不会影响这里的任何 key。
          </li>
        </ul>
      </div>
    </div>
  )
}
