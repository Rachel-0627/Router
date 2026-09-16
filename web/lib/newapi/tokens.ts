/**
 * new-api API Key(token)操作。
 *
 * 🔴 **实测确认的硬约束(2026-09-15)**:
 *    new-api **任何接口都不返回明文 key**,一律脱敏成 `eo49**********7gWr`。
 *    试过 GET /api/token/:id、列表接口、?show_key=true / ?full=1 / ?mask=false,
 *    全部脱敏;创建接口的响应体也不含 key;配置项里也没有关闭脱敏的开关。
 *
 *    ⚠️ 这意味着「在我们的控制台建 key 然后展示给用户」**做不到**。
 *       架构上必须二选一,见 docs/架构设计.md 的待决项:
 *       A. 我们自己签发 key,做一层代理,new-api 的 key 永不外露
 *       B. 让用户去 new-api 自带界面拿 key
 *    在定案之前,下面的函数只能用于「建/删/限额」,不能用于「取 key 给用户」。
 */
import { callNewApi, listPaged, microUsdToQuota } from './client'
import { logger } from '../logger'

export type NewApiToken = {
  id: number
  user_id: number
  /** ⚠️ 永远是脱敏值,不可展示给用户,也不能用来发请求 */
  key: string
  name: string
  status: number
  remain_quota: number
  used_quota: number
  unlimited_quota: boolean
  expired_time: number // -1 = 永不过期
  group: string
  created_time: number
  accessed_time: number
}

export async function createToken(input: {
  name: string
  /** 剩余额度(micro USD)。不传则不限额 */
  quotaMicroUsd?: number
  group?: string
}): Promise<void> {
  await callNewApi('/api/token/', {
    method: 'POST',
    body: {
      name: input.name,
      remain_quota: input.quotaMicroUsd != null ? microUsdToQuota(input.quotaMicroUsd) : 0,
      unlimited_quota: input.quotaMicroUsd == null,
      expired_time: -1,
      model_limits_enabled: false,
      group: input.group ?? 'default',
    },
  })
  logger.info('new-api 建 token', { name: input.name })
}

export async function listTokens(page = 1, pageSize = 100) {
  return listPaged<NewApiToken>('/api/token/', page, pageSize)
}

export async function getToken(id: number): Promise<NewApiToken> {
  return callNewApi<NewApiToken>(`/api/token/${id}`)
}

export async function deleteToken(id: number): Promise<void> {
  await callNewApi(`/api/token/${id}`, { method: 'DELETE' })
  logger.info('new-api 删 token', { id })
}

/** 改限额或启停。status: 1=启用 2=禁用 */
export async function updateToken(
  token: NewApiToken,
  patch: { name?: string; quotaMicroUsd?: number; status?: 1 | 2 },
): Promise<void> {
  await callNewApi('/api/token/', {
    method: 'PUT',
    body: {
      ...token,
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.status != null ? { status: patch.status } : {}),
      ...(patch.quotaMicroUsd != null
        ? { remain_quota: microUsdToQuota(patch.quotaMicroUsd), unlimited_quota: false }
        : {}),
    },
  })
  logger.info('new-api 改 token', { id: token.id })
}
