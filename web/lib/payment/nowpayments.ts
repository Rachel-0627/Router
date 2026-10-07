/**
 * NOWPayments 适配器(加密货币收款)。
 *
 * 接口取自官方文档与 Postman 集合(2026-10-07 核对):
 *   创建   POST {base}/v1/invoice
 *          body {price_amount, price_currency:'usd', order_id, order_description,
 *                ipn_callback_url, success_url, cancel_url, pay_currency, is_fixed_rate}
 *          返回 {id, invoice_url}
 *   回查   GET  {base}/v1/payment/?invoiceid=<invoice id>
 *   鉴权   x-api-key 请求头
 *   验签   x-nowpayments-sig = HMAC-SHA512(按 key 排序后的 JSON, IPN 密钥).hex
 *
 * ⚠️ **验签方式和别家不一样,这是最容易写错的地方。**
 *    Creem 之类是对**原始字节**算 HMAC,所以绝不能先 parse 再 stringify。
 *    NOWPayments 相反:它签的是**按 key 排序后重新序列化**的 JSON。
 *    照搬"用原始 body"的习惯写法,签名永远对不上。
 *
 * ⚠️ 为什么选 invoice 而不是 payment:
 *    invoice 的 id 在**创建时**就有,能直接存进订单表当 externalId;
 *    payment_id 要等用户选完币种才生成,创建时拿不到,订单就匹配不上了。
 *
 * ⚠️ 加密货币的两个现实:
 *    1. 用户从交易所提币会被扣手续费,想转 $20 实际到账可能只有 $18.9 ——
 *       状态会是 partially_paid。我们按**实际到账**入账,不卡住用户。
 *    2. 链上转账不可逆,所以退款只能人工按原链原币种退(见 /legal/refund)。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env'
import { getSecret } from '../secrets/store'
import { logger } from '../logger'
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentProvider,
  type PaymentStatus,
  type VerifiedPayment,
} from './provider'

const BASE_URL = 'https://api.nowpayments.io/v1'
const TIMEOUT_MS = 20_000

/**
 * 接受的币种。**只收稳定币** —— 开放收 BTC/ETH 的话,用户付款到我们到账
 * 之间价格会变,多收少收都成扯皮点。稳定币没这个问题。
 * 留空则由 NOWPayments 展示全部币种。
 */
const PAY_CURRENCY = 'usdttrc20'

/** NOWPayments 支付状态 → 我们的状态 */
const STATUS_MAP: Record<string, PaymentStatus> = {
  waiting: 'pending',      // 等用户转账
  confirming: 'pending',   // 链上确认中
  confirmed: 'pending',    // 链上已确认,平台还没结算完
  sending: 'pending',      // 正在打给我们
  finished: 'paid',        // 全额到账
  partially_paid: 'paid',  // 少付了 —— 仍按实际到账入账,不让用户钱卡住
  failed: 'failed',
  refunded: 'refunded',
  expired: 'expired',
}

type AnyRec = Record<string, unknown>
const rec = (v: unknown): AnyRec | undefined => (v && typeof v === 'object' ? (v as AnyRec) : undefined)
const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

/**
 * 取 API key。
 *
 * ⚠️ 必须走 getSecret,不能直接读 env ——
 *    key 是在后台密钥页填的、加密存在库里,环境变量那份是空的。
 *    读错地方会出现"自检通过但真实充值报 Payments unavailable"
 *    这种最难查的不一致。getSecret 自带"库里没有就读环境变量"的兜底,
 *    两种配置方式都能用。
 */
async function apiKey(): Promise<string> {
  const k = await getSecret('NOWPAYMENTS_API_KEY')
  if (!k) throw new PaymentProviderError('nowpayments', '未配置 NOWPAYMENTS_API_KEY')
  return k
}

/**
 * @param tolerate404 true 时,404 返回 null 而不抛错。
 *   回查付款状态要用:上游说"没这笔付款"是**确定性结论**,不是临时故障。
 *   当成异常抛出去会被兜成 500,而 500 的语义是"请重试" ——
 *   那会让支付商对着一笔根本不存在的付款无限重投。
 */
async function call(path: string, init?: RequestInit, tolerate404 = false): Promise<unknown> {
  const key = await apiKey()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new PaymentProviderError('nowpayments', `请求失败: ${path}`, e)
  }
  const text = await res.text()
  if (res.status === 404 && tolerate404) return null
  if (!res.ok) {
    throw new PaymentProviderError('nowpayments', `${path} 返回 ${res.status}: ${text.slice(0, 200)}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new PaymentProviderError('nowpayments', `${path} 返回的不是 JSON`, e)
  }
}

/**
 * 按 NOWPayments 的规则序列化:**按 key 排序后的 JSON**。
 * 这里刻意照抄官方示例 `JSON.stringify(params, Object.keys(params).sort())` ——
 * 自己另写一套"更合理"的排序,签名就对不上了。要的是和对方逐字节一致,不是优雅。
 */
function sortedJson(obj: AnyRec): string {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

export const nowpayments: PaymentProvider = {
  name: 'nowpayments',

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const base = env.APP_URL.replace(/\/$/, '')
    const secret = env.PAYMENT_WEBHOOK_PATH_SECRET
    const body: AnyRec = {
      price_amount: (req.amountCents / 100).toFixed(2),
      price_currency: 'usd',
      order_id: req.orderId,
      order_description: `${env.APP_NAME} credits`,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // ⚠️ **不锁汇率**。锁汇率会把上游最低额抬到 18.55 USD,小额单根本付不了。
      //    关掉它的代价几乎为零:USDT 是稳定币,转账期间漂移可忽略;
      //    而且入账本来就是「到多少记多少」(见 lib/credits.ts),
      //    金额对不上本就不会卡住用户。
      is_fixed_rate: false,
      // 网络手续费由付款方承担 —— 否则我们到账永远少一截
      is_fee_paid_by_user: true,
    }
    if (PAY_CURRENCY) body.pay_currency = PAY_CURRENCY
    if (secret) body.ipn_callback_url = `${base}/api/webhook/nowpayments/${secret}`

    const out = rec(await call('/invoice', { method: 'POST', body: JSON.stringify(body) }))
    const id = str(out?.id)
    const url = str(out?.invoice_url)
    if (!id || !url) {
      throw new PaymentProviderError('nowpayments', `创建 invoice 返回缺字段: ${JSON.stringify(out).slice(0, 200)}`)
    }
    return { externalId: id, paymentUrl: url }
  },

  /**
   * 回查真实状态。
   *
   * ⚠️ **只能按 payment_id 查**。实测四个按 invoice 查的端点全不通:
   *      /invoice/{id}               404
   *      /payment/?invoiceId={id}    401(要 JWT)
   *      /payment/?invoiceid={id}    401(要 JWT)
   *      /invoice-payment/?iid={id}  404
   *    列表接口要拿账号密码换 JWT —— 存你的登录密码比存 API key 危险得多,
   *    不走那条路。而 /payment/{payment_id} 只要 API key。
   *
   *    payment_id 建单时还不存在(用户选完币种才生成),所以它从**已验签的
   *    回调**里取,经 settlePayment 的 handle 参数传进来。
   */
  async verifyPayment(externalId: string, handle?: string): Promise<VerifiedPayment> {
    if (!handle) {
      // 还没收到回调就没有 payment_id —— 这是正常状态,不是错误
      return { externalId, status: 'pending', amountCents: 0, currency: 'USD' }
    }

    const found = await call(`/payment/${encodeURIComponent(handle)}`, undefined, true)
    if (found === null) {
      // 上游查无此付款。签名却是合法的 —— 正常情况下不该发生(密钥只有我们和
      // 支付商知道),所以记一条告警。但不抛错:这是确定性结论,让对方重试没意义。
      logger.warn('回调声称已付款,但上游查无此笔 —— 不入账', { externalId, paymentId: handle })
      return { externalId, status: 'failed', amountCents: 0, currency: 'USD' }
    }
    const out = rec(found)
    const raw = str(out?.payment_status) ?? ''
    const status = STATUS_MAP[raw] ?? 'pending'

    // 金额口径:以**实际折算成美元的到账额**为准。
    // 少付时(交易所扣了提币手续费)actually_paid_at_fiat 会小于 price_amount,
    // 上层按实付入账,不卡住用户。
    const paidUsd = num(out?.actually_paid_at_fiat) ?? num(out?.price_amount) ?? 0

    return {
      externalId,
      status,
      amountCents: Math.round(paidUsd * 100),
      currency: 'USD',
      orderId: str(out?.order_id),
      paidAt: status === 'paid' ? new Date() : undefined,
    }
  },

  parseWebhookExternalId(body: unknown): string | null {
    // 只取 invoice_id —— 它和我们订单表里的 externalId 对应。
    // 其他字段(金额、状态)一律丢弃,以回查为准。
    return str(rec(body)?.invoice_id) ?? null
  },

  /** 回查要用的 payment_id。它建单时不存在,只能从回调里拿。 */
  parseWebhookVerifyHandle(body: unknown): string | null {
    return str(rec(body)?.payment_id) ?? null
  },

  async verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
    // 同样走 getSecret —— IPN 密钥也是在后台填的
    const secret = await getSecret('NOWPAYMENTS_IPN_SECRET')
    const got = headers.get('x-nowpayments-sig')
    if (!secret || !got) return false

    let parsed: AnyRec
    try {
      parsed = JSON.parse(rawBody) as AnyRec
    } catch {
      return false
    }
    if (!parsed || typeof parsed !== 'object') return false

    const expected = createHmac('sha512', secret).update(sortedJson(parsed), 'utf8').digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(got.trim(), 'hex')
    // 长度不等时 timingSafeEqual 会抛错,先挡住
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
  },
}
