/**
 * 拉 new-api 的用量日志,聚合成我们自己的 usage_daily。
 *
 * ⚠️ **字段形状未经真实流量验证**。本地 new-api 日志表是空的(还没有上游 key
 *    可以真跑一次请求),下面的字段名来自 new-api 的日志列表结构。
 *    **接上真实上游后必须先 dump 一条真实日志核对**,再启用聚合写库,
 *    否则可能把用量算错 —— 这是直接影响计费的地方,不许想当然。
 *
 * 铁律:**不存 prompt 内容**,只取 token 数。这既是 GDPR 友好,也是卖点。
 */
import { listPaged } from './client'

/** new-api 日志类型:2 = 消费记录(我们只关心这个) */
export const LOG_TYPE_CONSUME = 2

export type NewApiLog = {
  id: number
  user_id: number
  created_at: number
  type: number
  model_name: string
  token_name: string
  prompt_tokens: number
  completion_tokens: number
  quota: number
  /** 缓存相关字段名待真实流量核对 */
  other?: string
}

/** 按时间区间拉消费日志。startSec/endSec 是 Unix 秒。 */
export async function fetchConsumeLogs(opts: {
  startSec: number
  endSec: number
  page?: number
  pageSize?: number
  username?: string
}) {
  return listPaged<NewApiLog>('/api/log/', opts.page ?? 1, opts.pageSize ?? 100, {
    type: LOG_TYPE_CONSUME,
    start_timestamp: opts.startSec,
    end_timestamp: opts.endSec,
    ...(opts.username ? { username: opts.username } : {}),
  })
}

/** 翻完所有页。日志量大时按天调,别一次拉太宽。 */
export async function fetchAllConsumeLogs(startSec: number, endSec: number, maxPages = 100) {
  const all: NewApiLog[] = []
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetchConsumeLogs({ startSec, endSec, page, pageSize: 100 })
    all.push(...r.items)
    if (r.items.length === 0 || all.length >= r.total) break
  }
  return all
}
