/**
 * 看板图元 —— 纯 CSS/DOM,不引图表库。
 *
 * 遵循的可视化规范(挑重点):
 *   · 单系列不加图例 —— 标题已经说明画的是什么,一个色块的图例只是重复
 *   · 标签只标极值,不是每根都标 —— 每个点都标数字等于没标
 *   · 名义类别(模型名)一律**同色**,不按大小深浅 —— 那会把长度重复编码成颜色
 *   · 相邻柱之间留 2px 表面色缝隙分隔,不画描边
 *   · 柱子 ≤24px 粗、数据端 4px 圆角、基线端方角
 *   · 网格线为一档灰的实线发丝线,不用虚线
 *   · 每张图都有表格孪生体 —— 数值永远不只能靠悬停才看得到
 */

const money = (micro: number) =>
  micro >= 10_000 ? `$${(micro / 1e6).toFixed(2)}` : `$${(micro / 1e6).toFixed(4)}`

/** 指标卡。大数字用比例字形不用等宽(等宽在大字号下会显松散)。 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="text-xs tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-2 text-sm text-[var(--muted)]">{hint}</div>}
    </div>
  )
}

/**
 * 比率计量条 —— 单一比率对照上限,用 meter 而不是两片饼。
 * 轨道是同色系的浅一档,这样整条都能读出状态。
 */
export function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  const safe = Math.max(0, Math.min(100, pct))
  return (
    <div className="rounded-lg border border-[var(--border)] p-5">
      <div className="text-xs tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold">{safe.toFixed(1)}%</div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--accent)]/15"
        role="meter"
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${safe}%` }} />
      </div>
      {hint && <div className="mt-2 text-sm text-[var(--muted)]">{hint}</div>}
    </div>
  )
}

/** 按天柱状图。单系列,只给最高的那天直接标数值。 */
export function DailyColumns({ rows }: { rows: { day: string; value: number }[] }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)
  const peak = rows.reduce((a, b) => (b.value > a.value ? b : a))

  return (
    <div>
      {/* 绘图区:发丝网格线在底,柱子在上 */}
      <div className="relative h-44">
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-t border-[var(--border)]" />
          ))}
        </div>
        <div className="relative flex h-full items-end gap-[2px]">
          {rows.map((r) => {
            const h = (r.value / max) * 100
            const isPeak = r.day === peak.day && r.value > 0
            return (
              <div key={r.day} className="group relative flex h-full flex-1 items-end justify-center">
                {isPeak && (
                  <span className="absolute -top-1 whitespace-nowrap font-mono text-[12px] tabular-nums text-[var(--muted)]">
                    {money(r.value)}
                  </span>
                )}
                <div
                  title={`${r.day} · ${money(r.value)}`}
                  className="w-full max-w-[24px] rounded-t bg-[var(--accent)] transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(h, r.value > 0 ? 2 : 0)}%` }}
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[12px] tabular-nums text-[var(--muted)]">
        <span>{rows[0]?.day.slice(5)}</span>
        <span>{rows[rows.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}

/** 按模型排序横条。名义类别 —— 所有条同色,靠左侧标签区分身份。 */
export function ModelBars({ rows }: { rows: { model: string; value: number }[] }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.model} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate font-mono text-xs text-[var(--muted)]" title={r.model}>
            {r.model}
          </div>
          <div className="flex-1">
            <div
              className="h-3 rounded-r bg-[var(--accent)]"
              style={{ width: `${Math.max((r.value / max) * 100, 1)}%` }}
              title={`${r.model} · ${money(r.value)}`}
            />
          </div>
          <div className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">{money(r.value)}</div>
        </div>
      ))}
    </div>
  )
}
