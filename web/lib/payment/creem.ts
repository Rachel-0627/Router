/**
 * Creem 适配器(Merchant of Record)。
 *
 * 所有接口、字段名、签名算法都取自官方文档(2026-09-16 核对):
 *   创建   POST {base}/v1/checkouts   body: {product_id, request_id, success_url, customer:{email}, metadata}
 *          返回 {id:"ch_...", checkout_url, status}
 *   回查   GET  {base}/v1/checkouts?checkout_id=ch_...
 *   验签   creem-signature 头 = HMAC-SHA256(原始body, webhook密钥).hex
 *   回调   {eventType:"checkout.completed", object:{id, request_id, order:{amount, currency, status}}}
 *
 * ⚠️ Creem 按**产品**收款,不是任意金额。所以每个充值档位要在 Creem
 *    后台建一个产品,再把 产品ID ↔ 金额 的映射填进环境变量。
 *    用 `npm run creem:setup` 可以一键建好并打印映射。
 *
 * ⚠️ 测试环境和生产环境的 key **不能混用**,base URL 也不同。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env'
import { getSecret } from '../secrets/store'
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type PaymentStatus,
  type VerifiedPayment,
} from './provider'

const PROD_BASE = 'https://api.creem.io'
const TEST_BASE = 'https://test-api.creem.io'
const TIMEOUT_MS = 20_000

const baseUrl = () => (env.CREEM_TEST_MODE ? TEST_BASE : PROD_BASE)

/** Creem 订单状态 → 我们的状态 */
const ORDER_STATUS: Record<string, PaymentStatus> = {
  paid: 'paid',
  pending: 'pending',
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
  canceled: 'failed',
}

type AnyRec = Record<string, unknown>
const rec = (v: unknown): AnyRec | undefined =>
  v && typeof v === 'object' ? (v as AnyRec) : undefined

/** 金额档位 → Creem 产品 ID。环境变量存 JSON,如 {"20":"prod_a","50":"prod_b"} */
function productMap(): Record<string, string> {
  if (!env.CREEM_PRODUCTS) return {}
  try {
    const m = JSON.parse(env.CREEM_PRODUCTS) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(m).filter(([, v]) => typeof v === 'string'),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * ⚠️ 走 getSecret 而不是直接读 env —— key 是在后台密钥页填的、加密存在库里。
 *    直接读 env 会出现"自检通过但真实支付报 unavailable"这种最难查的不一致
 *    (NOWPayments 那边就踩过)。getSecret 自带环境变量兜底,两种配法都支持。
 */
async function requireKey(): Promise<string> {
  const k = await getSecret('CREEM_API_KEY')
  if (!k) throw new PaymentProviderError('creem', 'CREEM_API_KEY 未配置')
  return k
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const key = await requireKey()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(init?.headers ?? {}) },
    })
    const text = await res.text()
    if (!res.ok) {
      // Creem 的错误体里有 trace_id,报障时给客服能快速定位
      throw new PaymentProviderError('creem', `HTTP ${res.status}`, text.slice(0, 300))
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new PaymentProviderError('creem', '响应不是合法 JSON', text.slice(0, 200))
    }
  } catch (e) {
    if (e instanceof PaymentProviderError) throw e
    throw new PaymentProviderError('creem', '请求失败', e)
  } finally {
    clearTimeout(timer)
  }
}

export const creem: PaymentProvider = {
  name: 'creem',

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const dollars = String(Math.round(req.amountCents / 100))
    const productId = productMap()[dollars]
    if (!productId) {
      throw new PaymentProviderError(
        'creem',
        `$${dollars} 这个档位没有对应的 Creem 产品。先跑 npm run creem:setup 建产品,再把映射填进 CREEM_PRODUCTS`,
      )
    }

    const data = await call('/v1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        // 我们自己的订单引用,Creem 会原样带回;同时兼做幂等键
        request_id: req.orderId,
        success_url: req.successUrl,
        customer: { email: req.userEmail },
        metadata: { orderId: req.orderId },
      }),
    })

    const d = rec(data)
    const externalId = d?.id
    const paymentUrl = d?.checkout_url
    if (typeof externalId !== 'string' || typeof paymentUrl !== 'string') {
      throw new PaymentProviderError('creem', '创建 checkout 的响应缺少 id 或 checkout_url', data)
    }
    return { externalId, paymentUrl }
  },

  async verifyPayment(externalId: string): Promise<VerifiedPayment> {
    const data = await call(`/v1/checkouts?checkout_id=${encodeURIComponent(externalId)}`)
    const d = rec(data)
    const order = rec(d?.order)

    // 订单还没生成 = 还没付款成功
    if (!order) {
      return { externalId, status: 'pending', amountCents: 0, currency: 'USD' }
    }
    const raw = String(order.status ?? '').toLowerCase()
    const status = ORDER_STATUS[raw]
    if (!status) throw new PaymentProviderError('creem', `未知订单状态: ${raw || '(空)'}`, data)

    // Creem 的 amount 是最小货币单位(分)
    const amount = order.amount
    if (typeof amount !== 'number') {
      throw new PaymentProviderError('creem', '回查响应里读不出金额', data)
    }

    return {
      externalId,
      status,
      amountCents: Math.round(amount),
      currency: String(order.currency ?? 'USD').toUpperCase(),
      paidAt: status === 'paid' ? new Date() : undefined,
      orderId: typeof d?.request_id === 'string' ? d.request_id : undefined,
    }
  },

  /** 只取 checkout id,其余字段全部丢弃,后续走 verifyPayment 回查 */
  parseWebhookExternalId(body: unknown): string | null {
    const b = rec(body)
    const obj = rec(b?.object)
    const id = obj?.id
    return typeof id === 'string' && id.startsWith('ch_') ? id : null
  },

  /**
   * creem-signature 头 = HMAC-SHA256(原始body, webhook密钥) 的十六进制。
   * 用定长比较,避免逐字节比较泄露信息。
   */
  async verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
    const secret = await getSecret('CREEM_WEBHOOK_SECRET')
    const got = headers.get('creem-signature')
    if (!secret || !got) return false
    try {
      const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
      const a = Buffer.from(expected, 'hex')
      const b = Buffer.from(got.trim(), 'hex')
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false
    }
  },
}
