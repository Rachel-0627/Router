/**
 * Anthropic Messages API —— Claude Code / Cline 走这条。
 * POST /v1/messages
 */
import { handleProxy } from '@/lib/gateway/proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** 编码 Agent 的单次请求可能跑很久,别让平台提前掐断 */
export const maxDuration = 800

export async function POST(req: Request) {
  return handleProxy(req, '/v1/messages')
}
