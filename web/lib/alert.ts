/**
 * 告警发送 —— 目前走 Telegram,以后加渠道只改这里。
 *
 * 铁律:告警内容**绝不能带密钥**。这里只接受调用方组装好的文本,
 * 但仍做一次兜底脱敏,防止有人手滑把 key 拼进消息。
 */
import { env } from './env'
import { logger } from './logger'

/** 兜底:把看起来像密钥的串打码 */
function scrub(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
}

export type AlertLevel = 'info' | 'warn' | 'critical'
const ICON: Record<AlertLevel, string> = { info: 'ℹ️', warn: '⚠️', critical: '🚨' }

/** 发告警。发不出去不抛错 —— 告警失败不该让监控脚本崩掉。 */
export async function sendAlert(level: AlertLevel, title: string, body?: string): Promise<boolean> {
  const text = scrub(`${ICON[level]} *${title}*${body ? `\n\n${body}` : ''}`)

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    // 没配告警也要让人看得见,至少进日志
    logger.warn('告警未发送(Telegram 未配置)', { level, title })
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return true
  } catch (e) {
    logger.error('告警发送失败', { level, title, detail: e instanceof Error ? e.message : String(e) })
    return false
  }
}
