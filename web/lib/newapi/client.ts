/**
 * new-api 管理接口的 HTTP 客户端 —— **全项目唯一**与 new-api 通信的地方。
 *
 * 以下全部基于本地 new-api 实测(2026-09-15,镜像 calciumion/new-api:latest),
 * 不是照文档猜的:
 *
 *   认证      POST /api/user/login {username,password} → data.access_token (JWT)
 *             之后 Authorization: Bearer <jwt>。JWT 有 access_expires_at,会过期。
 *             若配置了 NEWAPI_ADMIN_TOKEN(系统访问令牌),优先用它,免登录。
 *   额度单位  quota_per_unit = 500000,即 500000 quota = $1
 *             → 1 quota = 2 micro USD(见 lib/money.ts 的换算)
 *   列表响应  { data: { items: [], total, page, page_size }, success }
 *   单体响应  { data: {...}, message, success }
 *   错误      HTTP 200 + { success:false, message },**不是**靠状态码判断
 */
import { env } from '../env'
import { logger } from '../logger'

const TIMEOUT_MS = 15_000
const RETRIES = 2
/** new-api 的额度单位换算:500000 quota = $1 = 1_000_000 micro USD */
export const QUOTA_PER_USD = 500_000
export const microUsdToQuota = (micro: number) => Math.round(micro / 2)
export const quotaToMicroUsd = (quota: number) => quota * 2

export class NewApiError extends Error {
  constructor(readonly path: string, message: string, readonly raw?: unknown) {
    super(`new-api ${path}: ${message}`)
    this.name = 'NewApiError'
  }
}

type Envelope<T> = { success: boolean; message?: string; data?: T }

function baseUrl(): string {
  const u = env.NEWAPI_BASE_URL
  if (!u) throw new NewApiError('config', 'NEWAPI_BASE_URL 未配置')
  return u.replace(/\/$/, '')
}

// ── JWT 缓存。登录一次反复用,过期前 60 秒主动续。 ──
let cached: { token: string; expiresAt: number } | null = null

async function login(): Promise<string> {
  const user = env.NEWAPI_ADMIN_USER
  const pass = env.NEWAPI_ADMIN_PASSWORD
  if (!user || !pass) {
    throw new NewApiError(
      'config',
      '需要 NEWAPI_ADMIN_TOKEN,或 NEWAPI_ADMIN_USER + NEWAPI_ADMIN_PASSWORD',
    )
  }
  const res = await fetch(`${baseUrl()}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = (await res.json()) as Envelope<{ access_token: string; access_expires_at: number }>
  if (!body.success || !body.data?.access_token) {
    // ⚠️ 绝不把密码或返回体原样写进日志
    throw new NewApiError('/api/user/login', body.message || '登录失败')
  }
  cached = {
    token: body.data.access_token,
    expiresAt: (body.data.access_expires_at ?? 0) * 1000 - 60_000,
  }
  logger.info('new-api 管理员登录成功')
  return cached.token
}

async function authHeader(): Promise<Record<string, string>> {
  // 系统访问令牌优先 —— 不会过期,适合服务端长期使用
  if (env.NEWAPI_ADMIN_TOKEN) return { Authorization: env.NEWAPI_ADMIN_TOKEN }
  if (cached && Date.now() < cached.expiresAt) return { Authorization: `Bearer ${cached.token}` }
  return { Authorization: `Bearer ${await login()}` }
}

/**
 * 调 new-api。注意它**失败也返回 HTTP 200**,靠 body.success 判断。
 * 只有网络错误和 5xx 才重试;业务失败(success:false)直接抛,重试没意义。
 */
export async function callNewApi<T>(
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number> },
): Promise<T> {
  const qs = init?.query
    ? '?' + new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)]))
    : ''
  const url = `${baseUrl()}${path}${qs}`

  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: init?.body != null ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (res.status === 401 || res.status === 403) {
        cached = null // JWT 可能过期了,清掉缓存让下次重新登录
        throw new NewApiError(path, `鉴权失败 HTTP ${res.status}`)
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`) // 可重试

      const body = (await res.json()) as Envelope<T>
      if (!body.success) throw new NewApiError(path, body.message || '返回 success:false', body)
      return body.data as T
    } catch (e) {
      if (e instanceof NewApiError) throw e // 业务错误不重试
      lastErr = e
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw new NewApiError(path, `请求失败(已重试${RETRIES}次)`, lastErr)
}

/** 列表接口的统一分页响应 */
export type Paged<T> = { items: T[]; total: number; page: number; page_size: number }

export async function listPaged<T>(
  path: string,
  page = 1,
  pageSize = 100,
  extra: Record<string, string | number> = {},
): Promise<Paged<T>> {
  return callNewApi<Paged<T>>(path, { query: { p: page, page_size: pageSize, ...extra } })
}
