/**
 * 渠道健康探测 —— 项目的核心运维能力。
 *
 * 号池炸掉不是事故,是日常。这个脚本每 5 分钟跑一次,做三件事:
 *   1. 测试全部渠道,把结果写进 channel_probes(Status 页和 24h 可用率的数据源)
 *   2. **状态发生变化时**才告警 —— 一直挂着的渠道不该每 5 分钟吵你一次
 *   3. 全部渠道都挂时升级为 critical
 *
 * 部署: VPS 上 crontab
 *   *_/5 * * * * cd /path/web && npm run ops:health >> /var/log/gr-health.log 2>&1
 *   (上面的 *_/5 去掉下划线,这里是为了不破坏注释块)
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../lib/db'
import { channelProbes } from '../lib/db/schema'
import { listChannels, testChannel, CHANNEL_STATUS, type NewApiChannel } from '../lib/newapi/channels'
import { sendAlert } from '../lib/alert'
import { logger } from '../lib/logger'
import { featureReady } from '../lib/env'

/** 探测记录保留天数 */
const RETAIN_DAYS = 30

async function lastStatusOf(channelId: number): Promise<string | null> {
  const [row] = await db
    .select({ ok: channelProbes.ok })
    .from(channelProbes)
    .where(eq(channelProbes.channelId, channelId))
    .orderBy(desc(channelProbes.checkedAt))
    .limit(1)
  return row?.ok ?? null
}

async function probeOne(ch: NewApiChannel) {
  // 已被手动禁用的渠道不测 —— 那是你自己关的,不是故障
  if (ch.status === CHANNEL_STATUS.manuallyDisabled) return null

  const prev = await lastStatusOf(ch.id)
  const r = await testChannel(ch.id)
  // new-api 自动禁用(status=3)也算挂
  const ok = r.ok && ch.status !== CHANNEL_STATUS.autoDisabled

  await db.insert(channelProbes).values({
    channelId: ch.id,
    channelName: ch.name,
    upstreamGroup: ch.group,
    model: ch.test_model || ch.models.split(',')[0] || null,
    ok: ok ? 'up' : 'down',
    latencyMs: r.latencyMs,
    errorCode: ok ? null : (r.error ?? 'unknown').slice(0, 120),
  })

  return { ch, ok, prev, latencyMs: r.latencyMs, error: r.error }
}

async function main() {
  if (!featureReady.newapi()) {
    console.error('❌ new-api 未配置(NEWAPI_BASE_URL + 令牌或账号密码),无法探测')
    process.exit(2)
  }

  let channels: NewApiChannel[]
  try {
    channels = await listChannels()
  } catch (e) {
    // 连 new-api 都连不上,这本身就是最高级别的事故
    await sendAlert('critical', '无法连接 new-api', `渠道探测彻底失败:${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }

  if (channels.length === 0) {
    console.log('没有配置任何渠道')
    return
  }

  const results = []
  for (const ch of channels) {
    const r = await probeOne(ch)
    if (r) results.push(r)
  }

  // ── 只在状态**变化**时告警,避免一直挂着反复轰炸 ──
  for (const r of results) {
    const now = r.ok ? 'up' : 'down'
    if (r.prev === now) continue
    if (now === 'down') {
      await sendAlert('warn', `渠道挂了:${r.ch.name}`, `分组 ${r.ch.group}\n原因 ${r.error ?? '未知'}`)
    } else if (r.prev === 'down') {
      await sendAlert('info', `渠道恢复:${r.ch.name}`, `分组 ${r.ch.group} · ${r.latencyMs}ms`)
    }
  }

  const up = results.filter((r) => r.ok).length
  if (up === 0 && results.length > 0) {
    // 全站不可用要反复提醒(漏看一条 = 故障时间翻倍),但每 5 分钟一次太吵。
    // 折中:进入全挂状态时报一次,之后每小时补一次,直到恢复。
    const [prior] = await db
      .select({ n: sql<string>`count(*)` })
      .from(channelProbes)
      .where(sql`${channelProbes.checkedAt} > now() - interval '1 hour' and ${channelProbes.ok} = 'up'`)
    const quietHour = Number(prior?.n ?? 0) === 0
    const firstTimeDown = results.some((r) => r.prev !== 'down')
    if (firstTimeDown || !quietHour) {
      await sendAlert('critical', '全部渠道不可用', '所有分组都挂了,用户现在会收到 503。立刻处理。')
    }
  }

  // 清理旧记录,别让表无限涨
  await db.delete(channelProbes).where(sql`${channelProbes.checkedAt} < now() - interval '${sql.raw(String(RETAIN_DAYS))} days'`)

  const line = results.map((r) => `${r.ch.name}=${r.ok ? 'up' : 'down'}(${r.latencyMs}ms)`).join(' ')
  console.log(`${new Date().toISOString()} ${up}/${results.length} up · ${line}`)
  logger.info('渠道探测完成', { up, total: results.length })
  process.exit(0)
}

main().catch(async (e) => {
  console.error('探测脚本异常:', e instanceof Error ? e.message : e)
  await sendAlert('critical', '渠道探测脚本崩了', String(e).slice(0, 300))
  process.exit(1)
})
