/**
 * 回填分组表的新列(display_name / blurb / secret_slot / protocol / sort_order)。
 *
 * 为什么需要:这几列是后加的,已有行按默认值填 —— secret_slot 是空字符串,
 * protocol 一律 anthropic。空槽位会让网关退回没配置的通用 key 直接 503;
 * 协议错了会让 Codex 这类 GPT 线用错格式。两个都是静默故障,很难查。
 *
 * 只补**空值和明显错值**,不覆盖你在后台手工改过的内容。
 * 跑法:DATABASE_URL=<目标库> npx tsx ops/backfill-group-columns.ts
 */
import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { productGroupSettings } from '../lib/db/schema-models'
import { SEED_GROUPS, defaultSlotForGroup } from '../lib/pricing/groups'

async function main() {
  const rows = await db.select().from(productGroupSettings)
  if (rows.length === 0) {
    console.log('分组表为空 —— 先跑 ops/seed-group-settings.ts')
    process.exit(0)
  }

  const seed = new Map(SEED_GROUPS.map((g) => [g.id, g]))
  let changed = 0

  for (const r of rows) {
    const s = seed.get(r.groupId)
    const patch: Record<string, unknown> = {}

    if (!r.displayName) patch.displayName = s?.displayName ?? r.groupId
    if (!r.blurb && s?.blurb) patch.blurb = s.blurb
    if (!r.secretSlot) patch.secretSlot = s?.secretSlot ?? defaultSlotForGroup(r.groupId)
    // 协议只在种子里明确写了、且和库里不一致时才改 —— 不猜测自定义分组
    if (s && r.protocol !== s.protocol) patch.protocol = s.protocol
    if (r.sortOrder === 0 && s) patch.sortOrder = s.sortOrder

    if (Object.keys(patch).length === 0) {
      console.log(`  ${r.groupId.padEnd(10)} 无需改动`)
      continue
    }
    await db
      .update(productGroupSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(productGroupSettings.groupId, r.groupId))
    changed++
    console.log(`  ${r.groupId.padEnd(10)} 已补:${Object.keys(patch).join('、')}`)
  }

  console.log(`\n回填完成,改动 ${changed} 行。当前状态:`)
  for (const r of await db.select().from(productGroupSettings)) {
    console.log(
      `  ${r.groupId.padEnd(10)} ${r.displayName.padEnd(10)} ×${r.ratio} ${r.status.padEnd(8)} ${r.protocol.padEnd(10)} ${r.secretSlot}`,
    )
  }
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
