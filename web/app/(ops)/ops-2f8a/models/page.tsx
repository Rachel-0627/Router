import { getAllModelRows, rowToPricing, getGroupSettings } from '@/lib/pricing/registry'
import { sellPrices, grossMarginPct, worstCaseMarginPct, fallbackChain, primaryGroup } from '@/lib/pricing/calculate'
import { UPSTREAM_GROUP_LABEL } from '@/lib/pricing/types'
import { getGroup } from '@/lib/pricing/groups'
import { listImportable } from '@/app/actions/model-import'
import { ModelRowActions } from '@/components/ops/model-row-actions'
import { SyncPrices } from '@/components/ops/sync-prices'
import { AddModel } from '@/components/ops/add-model'

export const metadata = { title: 'ops · models', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`)

export default async function OpsModels() {
  const [rows, settings, imp] = await Promise.all([getAllModelRows(), getGroupSettings(), listImportable()])
  const groupRatioOf = new Map(settings.map((s) => [s.groupId, s.ratio]))
  const { candidates, error } = imp

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-xl font-semibold">模型目录</h1>

      <div className="mt-6"><SyncPrices /></div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        价格只能从上游同步,不提供手动输入 —— 一个模型有 12 个价格数字,手打必然出错,而价格错了就是直接赔钱。
      </p>

      <h2 className="mt-10 text-lg font-semibold">在售与下架的模型</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">模型</th>
              <th className="px-4 py-3 font-medium">分组</th>
              <th className="px-4 py-3 text-right font-medium">官方价</th>
              <th className="px-4 py-3 text-right font-medium">我们卖</th>
              <th className="px-4 py-3 text-right font-medium">主力毛利</th>
              <th className="px-4 py-3 text-right font-medium">兜底毛利</th>
              <th className="px-4 py-3 font-medium">降级链</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gs = settings.find((s) => s.groupId === r.productGroup)
              const m = rowToPricing(r, gs)
              const worst = worstCaseMarginPct(m)
              const chain = fallbackChain(m)
              const risky = worst !== null && worst < 5
              return (
                <tr key={r.id} className={`border-t border-[var(--border)] align-top ${r.status !== 'active' ? 'opacity-55' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{r.modelId}</span>
                      {r.status !== 'active' && <span className="rounded bg-[var(--muted)]/15 px-1.5 py-0.5 font-mono text-[12px]">下架</span>}
                      {r.recommended && <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[12px] text-[var(--accent)]">推荐</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">{r.displayName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {getGroup(m.group)?.displayName ?? m.group}
                    <div className="text-[var(--muted)]">
                      ×{m.ratio}
                      {r.ratioOverride !== null && (
                        <span className="ml-1 rounded bg-[var(--accent)]/12 px-1 text-[11px] text-[var(--accent)]">单独</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                    ${m.listPrice.input}/${m.listPrice.output}
                    {m.listPriceTiers?.length ? <div className="text-[12px]">有长文档位</div> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                    ${sellPrices(m).input.toFixed(2)}/${sellPrices(m).output.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{pct(grossMarginPct(m))}</td>
                  <td className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${risky ? 'font-semibold text-red-500' : ''}`}>
                    {pct(worst)}{risky && ' ⚠️'}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {chain.length === 0 ? <span className="text-red-500">无货</span> : chain.map((g) => UPSTREAM_GROUP_LABEL[g]).join(' → ')}
                    {chain.length === 1 && <div className="text-[12px] text-red-500">只有一档,挂了没兜底</div>}
                  </td>
                  <td className="px-4 py-3">
                    <ModelRowActions
                      id={r.id}
                      modelId={r.modelId}
                      status={r.status}
                      ratioOverride={r.ratioOverride}
                      groupRatio={groupRatioOf.get(r.productGroup) ?? 0.8}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        ⚠️ <strong>兜底毛利</strong>是上游降级到最贵那一档时的毛利。低于 5% 会被护栏拦住不让上架 ——
        那种情况下每个请求都在倒贴。主力分组:{rows[0] ? UPSTREAM_GROUP_LABEL[primaryGroup(rowToPricing(rows[0]))!] ?? '?' : '?'} 等。
      </p>

      <h2 className="mt-12 text-lg font-semibold">从上游新增</h2>
      {error ? (
        <p className="mt-3 text-sm text-red-500">拉取上游失败:{error}</p>
      ) : (
        <div className="mt-4"><AddModel candidates={candidates} /></div>
      )}
    </div>
  )
}
