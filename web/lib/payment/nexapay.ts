/**
 * NexaPay 适配器
 *
 * ⚠️ 现状:NexaPay 的 /docs /api /developers 页面都是空的,拿不到公开接口定义。
 *    下面 ENDPOINTS 和 FIELDS 两个配置块是按 REST 惯例写的**占位**,
 *    注册拿到 API Key 后,对照后台文档改这两块即可,其余代码不用动。
 *
 * 安全设计:
 *   1. webhook 只取订单号,金额和状态一律回查(NexaPay 无签名验证)
 *   2. 回查结果的金额必须和我们的订单金额一致,不一致视为异常
 *   3. 所有网络调用有超时,失败抛 PaymentProviderError 由上层统一处理
 */
import { env } from '../env'
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type PaymentStatus,
  type VerifiedPayment,
} from './provider'

// ─────────── 拿到真实文档后改这里 ───────────
const BASE_URL = 'https://api.nexapay.one'
const ENDPOINTS = {
  createCharge: '/v1/charges',
  getCharge: (id: string) => `/v1/charges/${encodeURIComponent(id)}`,
}
/** 支付商返回体里的字段名 —— 对照真实文档调整 */
const FIELDS = {
  id: ['id', 'charge_id', 'chargeId', 'order_id'],
  status: ['status', 'state', 'payment_status'],
  amountCents: ['amount_cents', 'amountCents'],
  amountMajor: ['amount', 'amount_usd', 'total'], // 以「元」为单位时用这个
  currency: ['currency', 'currency_code'],
  paymentUrl: ['payment_url', 'checkout_url', 'url', 'hosted_url', 'link'],
  paidAt: ['paid_at', 'paidAt', 'completed_at'],
  metadataOrderId: ['metadata.order_id', 'metadata.orderId', 'reference', 'external_id'],
}
/** 支付商状态 → 我们的状态 */
const STATUS_MAP: Record<string, PaymentStatus> = {
  paid: 'paid', completed: 'paid', success: 'paid', succeeded: 'paid', confirmed: 'paid',
  pending: 'pending', new: 'pending', created: 'pending', processing: 'pending', unresolved: 'pending',
  failed: 'failed', canceled: 'failed', cancelled: 'failed',
  expired: 'expired',
  refunded: 'refunded',
}
// ──────────────────────────────────────────

const TIMEOUT_MS = 15_000

/** 从任意嵌套对象里按候选路径取第一个存在的值 */
function pick(obj: unknown, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = obj
    for (const seg of path.split('.')) {
      if (cur == null || typeof cur !== 'object') { cur = undefined; break }
      cur = (cur as Record<string, unknown>)[seg]
    }
    if (cur != null && cur !== '') return cur
  }
  return undefined
}

function requireConfig() {
  if (!env.NEXAPAY_API_KEY) {
    throw new PaymentProviderError('nexapay', 'NEXAPAY_API_KEY 未配置')
  }
  return env.NEXAPAY_API_KEY
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const key = requireConfig()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(init?.headers ?? {}),
      },
    })
    const text = await res.text()
    if (!res.ok) {
      throw new PaymentProviderError('nexapay', `HTTP ${res.status}`, text.slice(0, 300))
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new PaymentProviderError('nexapay', '响应不是合法 JSON', text.slice(0, 200))
    }
  } catch (e) {
    if (e instanceof PaymentProviderError) throw e
    throw new PaymentProviderError('nexapay', '请求失败', e)
  } finally {
    clearTimeout(timer)
  }
}

/** 金额归一到「分」。支付商可能返回分,也可能返回元。 */
function toCents(raw: unknown): number | undefined {
  const cents = pick(raw, FIELDS.amountCents)
  if (typeof cents === 'number') return Math.round(cents)
  const major = pick(raw, FIELDS.amountMajor)
  if (typeof major === 'number') return Math.round(major * 100)
  if (typeof major === 'string' && major.trim() !== '') {
    const n = Number(major)
    if (Number.isFinite(n)) return Math.round(n * 100)
  }
  return undefined
}

export const nexapay: PaymentProvider = {
  name: 'nexapay',

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const data = await call(ENDPOINTS.createCharge, {
      method: 'POST',
      body: JSON.stringify({
        amount: req.amountCents / 100,
        currency: req.currency,
        customer_email: req.userEmail,
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        // 带上我们的订单号,回查时用来双向核对
        metadata: { order_id: req.orderId },
      }),
    })

    const externalId = pick(data, FIELDS.id)
    const paymentUrl = pick(data, FIELDS.paymentUrl)
    if (typeof externalId !== 'string' || typeof paymentUrl !== 'string') {
      throw new PaymentProviderError('nexapay', '创建支付会话的响应缺少 id 或 payment_url', data)
    }
    return { externalId, paymentUrl }
  },

  async verifyPayment(externalId: string): Promise<VerifiedPayment> {
    const data = await call(ENDPOINTS.getCharge(externalId))

    const rawStatus = String(pick(data, FIELDS.status) ?? '').toLowerCase()
    const status = STATUS_MAP[rawStatus]
    if (!status) {
      throw new PaymentProviderError('nexapay', `未知的支付状态: ${rawStatus || '(空)'}`, data)
    }
    const amountCents = toCents(data)
    if (amountCents == null) {
      throw new PaymentProviderError('nexapay', '回查响应里读不出金额', data)
    }
    const paidRaw = pick(data, FIELDS.paidAt)
    return {
      externalId,
      status,
      amountCents,
      currency: String(pick(data, FIELDS.currency) ?? 'USD').toUpperCase(),
      paidAt: typeof paidRaw === 'string' ? new Date(paidRaw) : undefined,
      orderId: typeof pick(data, FIELDS.metadataOrderId) === 'string'
        ? (pick(data, FIELDS.metadataOrderId) as string)
        : undefined,
    }
  },

  /** ⚠️ 只取 ID,其余字段全部丢弃 */
  parseWebhookExternalId(body: unknown): string | null {
    const id = pick(body, [...FIELDS.id, 'data.id', 'data.charge_id', 'object.id'])
    return typeof id === 'string' && id.length > 0 ? id : null
  },
}
