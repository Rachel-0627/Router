/**
 * 极简频率限制。
 *
 * ⚠️ **当前是进程内内存实现**,只能挡住同一个实例上的连续尝试。
 *    Vercel 是多实例 Serverless,攻击者换个实例就绕过去了。
 *    **正式放量前必须换成 Postgres 或 Redis 计数**(表结构简单:key/窗口起点/计数)。
 *    现在这样至少挡住了脚本小子的单机暴力尝试,比完全没有强。
 *
 * 用在:登录、注册。以后按 key 限流、按接口限流也走这里。
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export async function checkRate(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; remaining: number }> {
  const now = Date.now()
  const b = buckets.get(key)

  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return { ok: true, remaining: limit - 1 }
  }
  b.count += 1
  // 顺手清理过期条目,防止内存无限涨
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
  }
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count) }
}
