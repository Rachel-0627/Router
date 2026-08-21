/**
 * 统一错误处理。
 *
 * 两条原则:
 *   1. userMessage 是给用户看的英文文案,永远不含内部细节
 *   2. detail 只进日志,绝不返回给用户
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_CREDITS'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL'

const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INSUFFICIENT_CREDITS: 402,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
}

/** 默认英文文案。面向海外用户,措辞要友好且不暴露实现。 */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Some of the information you provided is invalid. Please check and try again.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'That action conflicts with the current state. Please refresh and try again.',
  RATE_LIMITED: "You're sending requests too quickly. Please slow down and try again shortly.",
  INSUFFICIENT_CREDITS: 'Your balance is too low for this request. Please top up to continue.',
  UPSTREAM_UNAVAILABLE:
    'We are experiencing temporary capacity issues. Please retry in a few moments.',
  INTERNAL: 'Something went wrong on our end. We have been notified and are looking into it.',
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: number
  readonly userMessage: string
  /** 仅供日志,绝不返回给用户 */
  readonly detail?: unknown

  constructor(code: ErrorCode, opts?: { userMessage?: string; detail?: unknown; cause?: unknown }) {
    super(opts?.userMessage ?? DEFAULT_MESSAGE[code], { cause: opts?.cause })
    this.name = 'AppError'
    this.code = code
    this.httpStatus = HTTP_STATUS[code]
    this.userMessage = opts?.userMessage ?? DEFAULT_MESSAGE[code]
    this.detail = opts?.detail
  }
}

// 快捷构造函数
export const badRequest = (m?: string, d?: unknown) =>
  new AppError('BAD_REQUEST', { userMessage: m, detail: d })
export const unauthorized = (d?: unknown) => new AppError('UNAUTHORIZED', { detail: d })
export const forbidden = (d?: unknown) => new AppError('FORBIDDEN', { detail: d })
export const notFound = (d?: unknown) => new AppError('NOT_FOUND', { detail: d })
export const conflict = (m?: string, d?: unknown) =>
  new AppError('CONFLICT', { userMessage: m, detail: d })
export const rateLimited = (d?: unknown) => new AppError('RATE_LIMITED', { detail: d })
export const insufficientCredits = (d?: unknown) =>
  new AppError('INSUFFICIENT_CREDITS', { detail: d })
export const upstreamUnavailable = (d?: unknown) =>
  new AppError('UPSTREAM_UNAVAILABLE', { detail: d })
export const internal = (cause?: unknown) => new AppError('INTERNAL', { cause, detail: cause })

/** 把任意异常收敛成 AppError —— 未知异常一律当 INTERNAL,不泄露原文 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  return internal(e)
}

/** API 路由返回给前端的安全响应体 */
export function toErrorResponse(e: unknown): { body: { error: { code: string; message: string } }; status: number } {
  const err = toAppError(e)
  return {
    body: { error: { code: err.code, message: err.userMessage } },
    status: err.httpStatus,
  }
}
