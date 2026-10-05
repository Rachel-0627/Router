import { db } from '@/lib/db'
import { models } from '@/lib/db/schema-models'
import { getGroupSettings, rowToPricing } from '@/lib/pricing/registry'
import { costPrices, lastResortGroup } from '@/lib/pricing/calculate'
import { getGroups } from '@/lib/pricing/groups'
import { RatioForm } from '@/components/ops/ratio-form'

export const metadata = { title: 'ops · pricing', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function OpsPricing() {
  const [rows, settings, groups] = await Promise.all([
    db.select().from(models),
    getGroupSettings(),
    getGroups(),
  ])
  const byGroup = new Map(settings.map((s) => [s.groupId, s]))

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-xl font-semibold">定价倍率</h1>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        售价 = 官方 list price × 倍率。改完立刻生效，全站页面和计费同步更新（缓存会被清掉）。
      </p>

      <div className="mt-8 space-y-8">
        {groups.map((g) => {
          const s = byGroup.get(g.id)
          const groupRows = rows
            .filter((r) => r.productGroup === g.id)
            .map((r) => {
              const m = rowToPricing(r, s)
              const last = lastResortGroup(m)
              return {
                modelId: r.modelId,
                active: r.status === 'active',
                listInput: r.listInput,
                worstCostInput: last ? (costPrices(m, last)?.input ?? null) : null,
              }
            })
          if (groupRows.length === 0) return null
          return (
            <RatioForm
              key={g.id}
              groupId={g.id}
              groupName={g.displayName}
              ratio={s?.ratio ?? g.ratio}
              status={s?.status ?? g.status}
              rows={groupRows}
            />
          )
        })}
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold">两条提醒</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[var(--muted)]">
          <li>
            <strong>兜底毛利</strong>是上游降级到最贵那一档时的毛利。低于 5% 会拒绝保存 ——
            那种情况下每个请求都在倒贴。
          </li>
          <li>
            改倍率<strong>立刻影响所有用户的账单</strong>。已经发生的用量按当时的价算，不会追溯。
          </li>
        </ul>
      </div>
    </div>
  )
}
