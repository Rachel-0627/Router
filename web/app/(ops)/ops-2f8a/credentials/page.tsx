import { allSlots } from '@/lib/secrets/slots'
import { slotStatuses } from '@/lib/secrets/store'
import { currentFingerprint, hasKek, hasOldKek } from '@/lib/secrets/keys'
import { getUpstreams } from '@/lib/upstreams'
import { getGroups } from '@/lib/pricing/groups'
import { SecretForm, type SlotView } from '@/components/ops/secret-form'
import { UpstreamForm, type UpstreamView } from '@/components/ops/upstream-form'
import { UpstreamTest } from '@/components/ops/upstream-test'
import { UpstreamModels } from '@/components/ops/upstream-models'
import { KekPanel } from '@/components/ops/kek-panel'

export const metadata = { title: 'ops · credentials', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('zh-CN') : null)

export default async function OpsCredentials() {
  const [defs, statuses, ups, groups] = await Promise.all([
    allSlots(),
    slotStatuses(),
    getUpstreams(),
    getGroups(),
  ])
  const bySlot = new Map(statuses.map((s) => [s.slot, s]))

  const views: SlotView[] = defs.map((def) => {
    const st = bySlot.get(def.slot)
    return {
      slot: def.slot,
      label: def.label,
      hint: def.hint,
      secret: def.secret,
      kind: def.kind,
      upstreamId: def.upstreamId,
      configured: st?.configured ?? false,
      source: st?.source ?? 'none',
      last4: st?.last4 ?? null,
      updatedAt: fmt(st?.updatedAt ?? null),
      stale: st?.stale ?? false,
      unreadable: st?.unreadable ?? false,
    }
  })

  const byUpstream = (id: string) => views.filter((v) => v.kind === 'group' && v.upstreamId === id)
  const orphan = views.filter((v) => v.kind === 'group' && !ups.some((u) => u.id === v.upstreamId))
  const fallbackKey = views.filter((v) => v.kind === 'upstream')
  const payment = views.filter((v) => v.kind === 'payment')

  const upstreamViews: UpstreamView[] = ups.map((u) => ({
    ...u,
    groups: groups
      .filter((g) => g.upstreamId === u.id)
      .map((g) => ({
        id: g.id,
        displayName: g.displayName,
        keyFilled: bySlot.get(g.secretSlot)?.configured ?? false,
      })),
  }))

  const testKeys = views
    .filter((v) => v.secret && v.kind !== 'payment')
    .map((v) => ({ slot: v.slot, label: v.label, configured: v.configured }))

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-xl font-semibold">上游与密钥</h1>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        每个上游是一家供应商。产品线挂到哪个上游，就用那个上游的地址，再填这条线自己的 key。
        key 加密后存数据库，<strong>保存即生效，不用重新部署</strong>。
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

      {upstreamViews.map((u) => (
        <section key={u.id} className="mt-10">
          <UpstreamForm view={u} />
          <div className="mt-4 space-y-4 border-l-2 border-[var(--border)] pl-5">
            {byUpstream(u.id).length === 0 ? (
              <p className="text-[13px] text-[var(--muted)]">
                还没有产品线挂在这个上游下。去
                <a href="/ops-2f8a/groups" className="underline underline-offset-2">分组管理</a>
                把某条产品线改挂过来。
              </p>
            ) : (
              byUpstream(u.id).map((v) => <SecretForm key={v.slot} view={v} />)
            )}
          </div>
        </section>
      ))}

      {orphan.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-amber-700">没挂上游的产品线</h2>
          <p className="mt-1.5 text-[13px] text-[var(--muted)]">
            这些产品线还没指定从哪家进货，网关会退回读旧配置。去
            <a href="/ops-2f8a/groups" className="underline underline-offset-2">分组管理</a>给它们挑一个上游。
          </p>
          <div className="mt-4 space-y-4">
            {orphan.map((v) => (
              <SecretForm key={v.slot} view={v} />
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-12 text-lg font-semibold">新增上游</h2>
      <div className="mt-4">
        <UpstreamForm isNew />
      </div>

      <h2 className="mt-12 text-lg font-semibold">实测</h2>
      <div className="mt-4 space-y-4">
        <UpstreamModels keys={testKeys} />
        <UpstreamTest keys={testKeys} />
      </div>

      <h2 className="mt-12 text-lg font-semibold">兜底与支付</h2>
      <div className="mt-4 space-y-4">
        {fallbackKey.map((v) => (
          <SecretForm key={v.slot} view={v} />
        ))}
        {payment.map((v) => (
          <SecretForm key={v.slot} view={v} />
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold">三件要知道的事</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[var(--muted)]">
          <li>
            <strong>库里只存密文。</strong>加密钥匙放在 Vercel 环境变量 <code className="font-mono">SECRETS_KEK</code>，
            故意不进数据库 —— 否则库被导出时钥匙和锁一起泄露。<strong>上游地址不加密</strong>，它不是秘密。
          </li>
          <li>
            <strong>这把钥匙丢了要重填一次。</strong>任何加密方案都绕不过这点，值得单独备份一下。
            真丢了也不会停摆：没填的槽位会自动退回读环境变量。
          </li>
          <li>
            <strong>暂不做跨上游自动切换。</strong>A 家挂了不会自动走 B 家 —— 那要处理重试、
            计费归属和成本记账，不是加个字段能解决的。现在是“能挂多个、能手动切”。
          </li>
        </ul>
      </div>
    </div>
  )
}
