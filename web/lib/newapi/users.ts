/**
 * new-api 用户操作。我们的用户身份在自己的 Postgres,额度在 new-api,
 * 靠 users.newapi_user_id 映射。
 *
 * ⚠️ 实测踩到的两个坑(2026-09-15):
 *   1. PUT /api/user/ **不会**更新 quota —— 传了也被忽略,静默失败。
 *      加额度必须走 POST /api/user/topup。
 *   2. topup 默认被合规开关拦截,报「Payment... features are disabled」。
 *      需管理员在 new-api 后台确认合规条款(payment_setting.compliance_confirmed),
 *      这是一次**人工的法律声明**,必须由你本人操作,代码不该代劳。
 */
import { callNewApi, listPaged, microUsdToQuota, quotaToMicroUsd, NewApiError } from './client'
import { logger } from '../logger'

export type NewApiUser = {
  id: number
  username: string
  display_name: string
  role: number
  status: number
  group: string
  quota: number
  used_quota: number
  request_count: number
}

/** 建用户。username 用我们这边的用户 id,保证唯一且不泄露邮箱。 */
export async function createUser(input: {
  username: string
  password: string
  displayName?: string
}): Promise<void> {
  await callNewApi('/api/user/', {
    method: 'POST',
    body: {
      username: input.username,
      password: input.password,
      display_name: input.displayName ?? input.username,
    },
  })
  logger.info('new-api 建用户成功', { username: input.username })
}

export async function getUser(id: number): Promise<NewApiUser> {
  return callNewApi<NewApiUser>(`/api/user/${id}`)
}

/** 按 username 找用户。new-api 没有按名查的接口,只能翻页找。 */
export async function findUserByUsername(username: string): Promise<NewApiUser | null> {
  for (let page = 1; page <= 50; page++) {
    const r = await listPaged<NewApiUser>('/api/user/', page, 100)
    const hit = r.items.find((u) => u.username === username)
    if (hit) return hit
    if (r.items.length === 0 || page * r.page_size >= r.total) break
  }
  return null
}

/** 余额(micro USD)。new-api 存的是 quota,这里统一换算成项目内的单位。 */
export async function getBalanceMicroUsd(newapiUserId: number): Promise<number> {
  const u = await getUser(newapiUserId)
  return quotaToMicroUsd(u.quota)
}

/**
 * 加额度。**充值成功后调这里**,把钱变成 new-api 里的可用额度。
 *
 * ⚠️ 调用方必须保证幂等 —— 这个接口本身不幂等,重复调用会重复加钱。
 *    正确姿势:先过 lib/credits.ts 的 settlePayment(有行级锁+状态幂等),
 *    确认真的入账了,再调这里。
 */
export async function addQuota(
  newapiUserId: number,
  microUsd: number,
  remark?: string,
): Promise<void> {
  if (!Number.isFinite(microUsd) || microUsd <= 0) {
    throw new NewApiError('/api/user/topup', `加额度金额非法: ${microUsd}`)
  }
  try {
    await callNewApi('/api/user/topup', {
      method: 'POST',
      body: { user_id: newapiUserId, quota: microUsdToQuota(microUsd), remark: remark ?? '' },
    })
  } catch (e) {
    if (e instanceof NewApiError && /disabled|compliance/i.test(e.message)) {
      throw new NewApiError(
        '/api/user/topup',
        'new-api 的充值功能未启用 —— 需管理员在后台确认合规条款后才能加额度。' +
          '这是一次性的人工操作,不做的话用户付了钱也拿不到额度。',
      )
    }
    throw e
  }
  logger.info('new-api 加额度成功', { newapiUserId, microUsd })
}

/** 封号 / 解封。status: 1=正常 2=封禁 */
export async function setUserStatus(user: NewApiUser, status: 1 | 2): Promise<void> {
  await callNewApi('/api/user/', { method: 'PUT', body: { ...user, status } })
  logger.info('new-api 改用户状态', { id: user.id, status })
}

export { quotaToMicroUsd, microUsdToQuota }
