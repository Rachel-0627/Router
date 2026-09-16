/**
 * Status 页数据。
 *
 * 设计取向:**宁可显示「无数据」也不编造「正常」**。
 * 探测脚本没跑、或刚部署还没积累数据时,诚实地说不知道 —— 这正是
 * 主动公示状态能降低拒付率的原因:用户信的是你不掩饰。
 */
import { desc, sql } from 'drizzle-orm'
import { db } from '../index'
import { channelProbes } from '../schema'

export type ChannelStatus = {
  channelId: number
  channelName: string
  upstreamGroup: string | null
  /** 最近一次探测结果 */
  current: 'up' | 'down'
  lastCheckedAt: Date
  latencyMs: number | null
  /** 24 小时可用率,探测次数不足时为 null */
  uptime24h: number | null
  probes24h: number
}

export async function channelStatuses(): Promise<ChannelStatus[]> {
  const rows = await db
    .select({
      channelId: channelProbes.channelId,
      channelName: sql<string>`(array_agg(${channelProbes.channelName} order by ${channelProbes.checkedAt} desc))[1]`,
      upstreamGroup: sql<string | null>`(array_agg(${channelProbes.upstreamGroup} order by ${channelProbes.checkedAt} desc))[1]`,
      current: sql<string>`(array_agg(${channelProbes.ok} order by ${channelProbes.checkedAt} desc))[1]`,
      lastCheckedAt: sql<Date>`max(${channelProbes.checkedAt})`,
      latencyMs: sql<number | null>`(array_agg(${channelProbes.latencyMs} order by ${channelProbes.checkedAt} desc))[1]`,
      upCount: sql<string>`count(*) filter (where ${channelProbes.ok} = 'up' and ${channelProbes.checkedAt} > now() - interval '24 hours')`,
      total24h: sql<string>`count(*) filter (where ${channelProbes.checkedAt} > now() - interval '24 hours')`,
    })
    .from(channelProbes)
    .groupBy(channelProbes.channelId)
    .orderBy(desc(sql`max(${channelProbes.checkedAt})`))

  return rows.map((r) => {
    const total = Number(r.total24h)
    return {
      channelId: r.channelId,
      channelName: r.channelName,
      upstreamGroup: r.upstreamGroup,
      current: r.current === 'up' ? 'up' : 'down',
      lastCheckedAt: r.lastCheckedAt,
      latencyMs: r.latencyMs,
      // 探测次数太少算出来的可用率没意义,宁可不显示
      uptime24h: total >= 3 ? (Number(r.upCount) / total) * 100 : null,
      probes24h: total,
    }
  })
}

/** 最近的故障事件,用于「历史事件」区 */
export async function recentIncidents(limit = 10) {
  return db
    .select({
      checkedAt: channelProbes.checkedAt,
      channelName: channelProbes.channelName,
      upstreamGroup: channelProbes.upstreamGroup,
      errorCode: channelProbes.errorCode,
    })
    .from(channelProbes)
    .where(sql`${channelProbes.ok} = 'down' and ${channelProbes.checkedAt} > now() - interval '7 days'`)
    .orderBy(desc(channelProbes.checkedAt))
    .limit(limit)
}
