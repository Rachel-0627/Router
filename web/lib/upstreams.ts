/**
 * 上游供应商的读取与鉴权组装。
 *
 * ⚠️ 鉴权方式必须按上游配,不能写死。各家差别很实在:
 *      new-api 系(泽西同学)  Authorization: Bearer sk-xxx
 *      Anthropic 官方          x-api-key: sk-ant-xxx
 *      部分中转站              Authorization: sk-xxx(不带 Bearer)
 *    写死一种 = 接第二家就要改代码,那这张表就白建了。
 */
import { db } from './db'
import { upstreams } from './db/schema-upstreams'
import { env } from './env'

export const AUTH_STYLES = ['bearer', 'x-api-key', 'raw'] as const
export type AuthStyle = (typeof AUTH_STYLES)[number]

export const AUTH_STYLE_LABEL: Record<AuthStyle, string> = {
  bearer: 'Authorization: Bearer <key>(new-api 系、OpenAI 官方)',
  'x-api-key': 'x-api-key: <key>(Anthropic 官方)',
  raw: 'Authorization: <key>(部分中转站,不带 Bearer)',
}

export type Upstream = {
  id: string
  displayName: string
  baseUrl: string
  authStyle: AuthStyle
  note: string
  sortOrder: number
}

// ── 缓存:网关每个请求都要查,不能每次打库 ──
let cache: { list: Upstream[]; at: number } | null = null
const TTL_MS = 60_000

export function invalidateUpstreamCache() {
  cache = null
}

function toUpstream(r: typeof upstreams.$inferSelect): Upstream {
  const style = (AUTH_STYLES as readonly string[]).includes(r.authStyle)
    ? (r.authStyle as AuthStyle)
    : 'bearer'
  return {
    id: r.id,
    displayName: r.displayName || r.id,
    baseUrl: r.baseUrl.replace(/\/$/, ''),
    authStyle: style,
    note: r.note,
    sortOrder: r.sortOrder,
  }
}

export async function getUpstreams(): Promise<Upstream[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list
  let list: Upstream[] = []
  try {
    const rows = await db.select().from(upstreams)
    list = rows.map(toUpstream).sort((a, b) => a.sortOrder - b.sortOrder)
  } catch {
    list = [] // 读不到就当没有,由调用方走环境变量兜底
  }
  cache = { list, at: Date.now() }
  return list
}

export async function getUpstream(id: string): Promise<Upstream | undefined> {
  if (!id) return undefined
  return (await getUpstreams()).find((u) => u.id === id)
}

export async function isValidUpstreamId(id: string): Promise<boolean> {
  return (await getUpstreams()).some((u) => u.id === id)
}

/**
 * 分组没挂上游时的兜底:用环境变量里的老地址。
 * 保留它是为了**迁移期间不中断服务** —— 库里还没回填完,网关也得能转发。
 */
export function envFallbackBaseUrl(): string | undefined {
  const u = env.NEWAPI_BASE_URL
  return u ? u.replace(/\/$/, '') : undefined
}

/** 按上游的鉴权方式把 key 组装成请求头 */
export function authHeaders(key: string, style: AuthStyle): Record<string, string> {
  switch (style) {
    case 'x-api-key':
      return { 'x-api-key': key }
    case 'raw':
      return { Authorization: key }
    default:
      return { Authorization: `Bearer ${key}` }
  }
}
