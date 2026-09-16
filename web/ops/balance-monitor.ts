/**
 * 上游余额监控 —— 防止上游欠费导致全站宕机。
 *
 * 这是你的止损线之一:上游余额耗尽 = 所有用户同时不可用,
 * 而且这种宕机**完全是可以提前避免的**,没理由让它发生。
 *
 * 三级水位:
 *   > 14 天   正常,不打扰
 *   7-14 天   info  该准备补货了
 *   3-7 天    warn  尽快补货
 *   < 3 天    critical 立刻补,否则要停服
 *
 * 部署: VPS crontab,每天跑一两次即可(余额不会分钟级剧变)
 *   0 9,21 * * * cd /path/web && npm run ops:balance >> /var/log/gr-balance.log 2>&1
 */
import { sql } from 'drizzle-orm'
import { db } from '../lib/db'
import { usageDaily } from '../lib/db/schema'
import { listChannels, refreshAllBalances, CHANNEL_STATUS } from '../lib/newapi/channels'
import { sendAlert, type AlertLevel } from '../lib/alert'
import { featureReady } from '../lib/env'

/** 按最近几天的消耗算日均,太短会被单日波动带偏 */
const BURN_WINDOW_DAYS = 7

/** 近 N 天的日均上游成本(美元) */
async function dailyBurnUsd(): Promise<number> {
  const since = new Date(Date.now() - BURN_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const [row] = await db
    .select({ cost: sql<string>`coalesce(sum(${usageDaily.costMicroUsd}),0)` })
    .from(usageDaily)
    .where(sql`${usageDaily.day} >= ${since}`)
  return Number(row?.cost ?? 0) / 1e6 / BURN_WINDOW_DAYS
}

function levelFor(days: number): AlertLevel | null {
  if (days < 3) return 'critical'
  if (days < 7) return 'warn'
  if (days < 14) return 'info'
  return null
}

async function main() {
  if (!featureReady.newapi()) {
    console.error('❌ new-api 未配置,无法查余额')
    process.exit(2)
  }

  // 先让 new-api 去上游拉一次最新余额,不然读到的是缓存
  try {
    await refreshAllBalances()
  } catch (e) {
    console.error('刷新余额失败(继续用缓存值):', e instanceof Error ? e.message : e)
  }

  const channels = (await listChannels()).filter((c) => c.status === CHANNEL_STATUS.enabled)
  if (channels.length === 0) {
    console.log('没有启用中的渠道')
    return
  }

  const totalBalance = channels.reduce((sum, c) => sum + (c.balance ?? 0), 0)
  const burn = await dailyBurnUsd()

  // 还没有真实用量时算不出天数,别瞎报警
  const days = burn > 0 ? totalBalance / burn : Infinity
  const daysText = Number.isFinite(days) ? `${days.toFixed(1)} 天` : '不适用(近期无消耗)'

  console.log(
    `${new Date().toISOString()} 上游余额 $${totalBalance.toFixed(2)} · ` +
      `日均消耗 $${burn.toFixed(4)} · 可撑 ${daysText}`,
  )
  for (const c of channels) {
    console.log(`  ${c.name.padEnd(20)} $${(c.balance ?? 0).toFixed(2)}`)
  }

  const level = Number.isFinite(days) ? levelFor(days) : null
  if (level) {
    await sendAlert(
      level,
      `上游余额只够 ${days.toFixed(1)} 天`,
      `当前余额 $${totalBalance.toFixed(2)}\n日均消耗 $${burn.toFixed(2)}\n\n` +
        `提醒:预付款不要超过 20 天用量(你的止损线之一)。`,
    )
  }
  process.exit(0)
}

main().catch(async (e) => {
  console.error('余额监控异常:', e instanceof Error ? e.message : e)
  await sendAlert('critical', '余额监控脚本崩了', String(e).slice(0, 300))
  process.exit(1)
})
