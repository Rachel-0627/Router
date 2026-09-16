/**
 * OpenAI 兼容端点 —— Cursor / 各类 SDK 走这条。
 * POST /v1/chat/completions
 */
import { handleProxy } from '@/lib/gateway/proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(req: Request) {
  return handleProxy(req, '/v1/chat/completions')
}
