/**
 * 日志 —— 自动脱敏。
 *
 * 铁律:日志里不允许出现密钥、密码、用户 prompt 内容。
 * 本模块在写出前强制过滤,不依赖调用方自觉。
 */
import { env } from './env'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL: Level = env.NODE_ENV === 'production' ? 'info' : 'debug'

/** 字段名命中这些关键词就整个打码 */
const SECRET_KEYS = [
  'password', 'passwordhash', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'auth', 'credential', 'cookie', 'sessionid',
  // 业务侧:绝不记录用户请求内容
  'prompt', 'messages', 'content', 'input_text',
]

/** 值里出现的密钥串直接替换 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_\-]{6,}/g,          // OpenAI / Anthropic 风格 key
  /Bearer\s+[A-Za-z0-9._\-]{10,}/gi, // Authorization 头
  /whsec_[A-Za-z0-9_\-]{6,}/g,       // Webhook 签名密钥
]

const MASK = '[REDACTED]'

function maskString(s: string): string {
  let out = s
  for (const re of SECRET_PATTERNS) out = out.replace(re, MASK)
  return out
}

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_\-\s]/g, '')
  return SECRET_KEYS.some((s) => k.includes(s.replace(/[_\-]/g, '')))
}

/** 递归脱敏。深度上限防止循环引用把进程转死。 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TOO_DEEP]'
  if (value == null) return value
  if (typeof value === 'string') return maskString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) {
    return { name: value.name, message: maskString(value.message) }
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? MASK : redact(v, depth + 1)
    }
    return out
  }
  return String(value)
}

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: maskString(msg),
    ...(meta ? { meta: redact(meta) } : {}),
  }

  const line = env.NODE_ENV === 'production' ? JSON.stringify(entry) : formatPretty(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function formatPretty(e: { ts: string; level: string; msg: string; meta?: unknown }) {
  const tag = e.level.toUpperCase().padEnd(5)
  const meta = e.meta ? ` ${JSON.stringify(e.meta)}` : ''
  return `${e.ts} ${tag} ${e.msg}${meta}`
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
}
