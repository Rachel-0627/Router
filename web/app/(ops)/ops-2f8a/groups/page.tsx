import { eq, and, count } from 'drizzle-orm'
import { db } from '@/lib/db'
import { models } from '@/lib/db/schema-models'
import { apiKeys } from '@/lib/db/schema'
import { getGroups } from '@/lib/pricing/groups'
import { slotStatuses } from '@/lib/secrets/store'
import { defaultSlotForGroup } from '@/lib/secrets/slots'
import { GroupForm, type GroupView } from '@/components/ops/group-form'

export const metadata = { title: 'ops · groups', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function OpsGroups() {
  const [groups, statuses] = await Promise.all([getGroups(), slotStatuses()])
  // key 填没填要显示在分组上 —— 不然用户不知道还差这一步
  const filled = new Set(statuses.filter((s) => s.configured).map((s) => s.slot))

  // 每组挂了多少模型、多少有效 key —— 删除前要看这个
  const views: GroupView[] = await Promise.all(
    groups.map(async (g) => {
      const [[m], [k]] = await Promise.all([
        db.select({ n: count() }).from(models).where(eq(models.productGroup, g.id)),
        db
          .select({ n: count() })
          .from(apiKeys)
          .where(and(eq(apiKeys.productGroup, g.id), eq(apiKeys.status, 'active'))),
      ])
      return {
        id: g.id,
        displayName: g.displayName,
        blurb: g.blurb,
        ratio: g.ratio,
        status: g.status,
        protocol: g.protocol,
        secretSlot: g.secretSlot || defaultSlotForGroup(g.id),
        sortOrder: g.sortOrder,
        keyFilled: filled.has(g.secretSlot || defaultSlotForGroup(g.id)),
        modelCount: m.n,
        keyCount: k.n,
      }
    }),
  )

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-xl font-semibold">产品分组</h1>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        用户建 key 时选的就是这个，决定能调哪些模型、按什么倍率计价。
        新建一条就是新开一条产品线 —— 不用改代码。
      </p>

      <div className="mt-8 space-y-5">
        {views.map((v) => (
          <GroupForm key={v.id} view={v} />
        ))}
      </div>

      <h2 className="mt-12 text-lg font-semibold">新建</h2>
      <div className="mt-4">
        <GroupForm isNew />
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-semibold">开一条新产品线的顺序</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-[var(--muted)]">
          <li>
            在上面<strong>新建分组</strong>，状态先留「未上架」—— 价格和渠道都没验过就开卖是在赌。
          </li>
          <li>
            去<a href="/ops-2f8a/credentials" className="underline underline-offset-2">密钥配置</a>
            填这个分组的上游 key，用那页的实测面板确认真能调通。
          </li>
          <li>
            去<a href="/ops-2f8a/models" className="underline underline-offset-2">模型目录</a>
            给它加模型，填上官方价和各档进货价。
          </li>
          <li>
            回<a href="/ops-2f8a/pricing" className="underline underline-offset-2">定价倍率</a>
            看兜底毛利 —— 低于 5% 会被拦住，那是上游一降级就倒贴的信号。
          </li>
          <li>确认无误后回来把状态改成「已上架」。</li>
        </ol>
        <p className="mt-4 text-[13px] leading-6 text-[var(--muted)]">
          ⚠️ <strong>标识建后不能改</strong>：已经发出去的 API key 绑着它，改了那些 key 全部作废，
          而用户完全不知道发生了什么。想换名字就改「显示名」，那个随时能改。
        </p>
      </div>
    </div>
  )
}
