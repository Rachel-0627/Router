/** 把 groups.ts 里的默认倍率和状态灌进库(一次性)。之后以库里的为准,后台可改。 */
import { db } from '../lib/db'
import { productGroupSettings } from '../lib/db/schema-models'
import { PRODUCT_GROUPS } from '../lib/pricing/groups'

async function main() {
  for (const g of PRODUCT_GROUPS) {
    await db
      .insert(productGroupSettings)
      .values({ groupId: g.id, ratio: g.defaultRatio, status: g.status })
      .onConflictDoNothing({ target: productGroupSettings.groupId })
  }
  const rows = await db.select().from(productGroupSettings)
  console.log('分组设置:')
  for (const r of rows) console.log(`  ${r.groupId.padEnd(8)} 倍率 ${r.ratio}  ${r.status}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
