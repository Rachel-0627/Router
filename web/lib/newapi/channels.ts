/**
 * new-api 渠道操作。基于本地实测(2026-09-15):
 *   GET  /api/channel/?p=1&page_size=N   列表(含 status/balance/response_time)
 *   POST /api/channel/                    建渠道,body 必须是 {mode:'single',channel:{...}}
 *   GET  /api/channel/test                异步测全部,返回 {task_id}
 *   GET  /api/channel/test/:id            测单个
 *   GET  /api/channel/update_balance      刷新全部余额
 *
 * status: 1=启用 2=手动禁用 3=自动禁用(new-api 判定它挂了)
 */
import { callNewApi, listPaged } from './client'

export const CHANNEL_STATUS = { enabled: 1, manuallyDisabled: 2, autoDisabled: 3 } as const

export type NewApiChannel = {
  id: number
  name: string
  type: number
  status: number
  group: string
  models: string
  priority: number
  weight: number
  /** 上游余额(美元),靠 update_balance 刷新 */
  balance: number
  balance_updated_time: number
  used_quota: number
  /** 上次测试的响应耗时(毫秒),0 表示没测过 */
  response_time: number
  test_time: number
  /** 测试用的模型名,可能为空 */
  test_model?: string
}

export async function listChannels(): Promise<NewApiChannel[]> {
  const out: NewApiChannel[] = []
  for (let page = 1; page <= 20; page++) {
    const r = await listPaged<NewApiChannel>('/api/channel/', page, 100)
    out.push(...r.items)
    if (r.items.length === 0 || out.length >= r.total) break
  }
  return out
}

/** 测单个渠道。返回是否通 + 耗时。**不抛错** —— 探测失败本身就是结果。 */
export async function testChannel(id: number): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now()
  try {
    await callNewApi(`/api/channel/test/${id}`)
    return { ok: true, latencyMs: Date.now() - started }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 只留短码,不把完整上游报错塞进库
    return { ok: false, latencyMs: Date.now() - started, error: msg.slice(0, 120) }
  }
}

/** 刷新全部渠道的上游余额 */
export async function refreshAllBalances(): Promise<void> {
  await callNewApi('/api/channel/update_balance')
}

/** 启用/禁用渠道 —— 故障转移时用来手动切 */
export async function setChannelStatus(ch: NewApiChannel, status: number): Promise<void> {
  await callNewApi('/api/channel/', { method: 'PUT', body: { ...ch, status } })
}
