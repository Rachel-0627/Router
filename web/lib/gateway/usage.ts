/**
 * 从上游响应里提取 token 用量。
 *
 * 只取数字,**绝不碰 prompt 内容** —— 既是 GDPR 友好,也是我们对外的卖点。
 *
 * 两种格式都要支持:
 *   Anthropic  message_start 给输入和缓存 token,message_delta 累计输出 token
 *   OpenAI     最后一个 chunk 的 usage(需客户端带 stream_options.include_usage)
 */
export type TokenUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

type AnyRec = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** 把一个 usage 对象合并进累计值。两家的字段名都认。 */
export function mergeUsage(acc: TokenUsage, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const u = raw as AnyRec
  // Anthropic
  if ('input_tokens' in u) acc.input = Math.max(acc.input, num(u.input_tokens))
  if ('output_tokens' in u) acc.output = Math.max(acc.output, num(u.output_tokens))
  if ('cache_read_input_tokens' in u) acc.cacheRead = Math.max(acc.cacheRead, num(u.cache_read_input_tokens))
  if ('cache_creation_input_tokens' in u) acc.cacheWrite = Math.max(acc.cacheWrite, num(u.cache_creation_input_tokens))
  // OpenAI
  if ('prompt_tokens' in u) acc.input = Math.max(acc.input, num(u.prompt_tokens))
  if ('completion_tokens' in u) acc.output = Math.max(acc.output, num(u.completion_tokens))
  const details = u.prompt_tokens_details
  if (details && typeof details === 'object') {
    acc.cacheRead = Math.max(acc.cacheRead, num((details as AnyRec).cached_tokens))
  }
}

/** 非流式:直接从 JSON body 里挖 usage 和 model */
export function usageFromJson(body: unknown): { usage: TokenUsage; model?: string } {
  const acc = emptyUsage()
  if (!body || typeof body !== 'object') return { usage: acc }
  const b = body as AnyRec
  mergeUsage(acc, b.usage)
  const model = typeof b.model === 'string' ? b.model : undefined
  return { usage: acc, model }
}

/**
 * 流式:喂一行一行的 SSE data,累计 usage。
 * 解析失败一律忽略 —— **绝不能因为解析不了就中断用户的流**。
 */
export class SseUsageCollector {
  readonly usage = emptyUsage()
  model?: string

  feedLine(line: string): void {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const obj = JSON.parse(payload) as AnyRec
      if (typeof obj.model === 'string') this.model ??= obj.model
      mergeUsage(this.usage, obj.usage)
      // Anthropic 的 message_start 把 usage 包在 message 里
      const msg = obj.message
      if (msg && typeof msg === 'object') {
        const m = msg as AnyRec
        if (typeof m.model === 'string') this.model ??= m.model
        mergeUsage(this.usage, m.usage)
      }
    } catch {
      // 不是完整 JSON(分片)就跳过,下一行再说
    }
  }
}
