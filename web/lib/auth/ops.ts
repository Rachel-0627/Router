/**
 * 运营后台门禁 —— 认账号,不认令牌。
 *
 * 之前是独立口令 + 独立 cookie,安全隔离更强,但对**单人运营**来说
 * 每 12 小时粘一次随机串的痛苦远大于收益。改成:
 *   用你自己的账号正常登录 → 账号被标记为 admin → 直接进
 *
 * 授权方式:命令行 `npm run ops:grant <邮箱>`。
 * 网页里不提供"提升为管理员"的入口 —— 那种入口本身就是提权漏洞的温床。
 */
import 'server-only'
import { getCurrentUser } from './dal'

export async function hasOpsAccess(): Promise<boolean> {
  const u = await getCurrentUser()
  return u?.role === 'admin'
}

/** 给页面用:同时要知道"没登录"还是"登录了但不是管理员" */
export async function opsAccessState(): Promise<'ok' | 'anonymous' | 'not-admin'> {
  const u = await getCurrentUser()
  if (!u) return 'anonymous'
  return u.role === 'admin' ? 'ok' : 'not-admin'
}
