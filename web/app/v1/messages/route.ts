/**
 * Anthropic Messages API —— Claude Code / Cline 走这条。
 * POST /v1/messages
 */
import { handleProxy } from '@/lib/gateway/proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/**
 * 单次请求最长执行时间(秒)。
 *
 * ⚠️ 这个值**受 Vercel 套餐限制**,超了会导致部署失败(构建能过,
 *    但发布时校验函数配置会被拒,日志里看不到明确报错)。
 *      Hobby(免费)  最多 300
 *      Pro          最多 800,可申请到 1800
 *    升级套餐后把这里改大即可。
 *
 * 300 秒对绝大多数编码 Agent 请求够用 —— 一次会话是几十个独立请求,
 * 不是一个长请求。真撞上超时的再考虑升级。
 */
export const maxDuration = 300

export async function POST(req: Request) {
  return handleProxy(req, '/v1/messages')
}
