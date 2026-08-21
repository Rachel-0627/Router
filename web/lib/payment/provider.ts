/**
 * 支付通道抽象接口 —— 换支付商只改这一层的实现,别处不动。
 *
 * 核心安全原则:**永远不信任 webhook 的内容**。
 * webhook 只用来知道「有个订单可能付款了」,金额和状态一律回查支付商 API 确认。
 * 原因:很多支付商(包括 NexaPay)的 webhook 没有签名验证,
 *       任何人知道回调地址就能伪造「付款成功」骗取额度。
 */

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

/** 发起支付 */
export type CheckoutRequest = {
  /** 我们自己的订单 ID,传给支付商做关联 */
  orderId: string
  amountCents: number
  currency: 'USD'
  userEmail: string
  /** 付款成功后跳回的地址 */
  successUrl: string
  cancelUrl: string
}

export type CheckoutSession = {
  /** 支付商那边的订单号 —— 幂等的依据 */
  externalId: string
  /** 让用户跳过去付款的地址 */
  paymentUrl: string
}

/** 回查校验的结果 —— 这才是可信的数据来源 */
export type VerifiedPayment = {
  externalId: string
  status: PaymentStatus
  /** 支付商确认的实付金额,用它对账,不用 webhook 里的 */
  amountCents: number
  currency: string
  paidAt?: Date
  /** 我们发起时带的 orderId,用于双向核对 */
  orderId?: string
}

export interface PaymentProvider {
  readonly name: string

  /** 创建支付会话,返回跳转地址 */
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>

  /**
   * 回查订单真实状态。
   * ⚠️ 入账前必须调这个,不能直接用 webhook 里的金额和状态。
   */
  verifyPayment(externalId: string): Promise<VerifiedPayment>

  /**
   * 从 webhook 里**只**提取订单号。
   * 其他字段一律丢弃 —— 拿到 ID 后走 verifyPayment 回查。
   * 返回 null 表示这个 webhook 无法识别,应当忽略。
   */
  parseWebhookExternalId(body: unknown, headers: Headers): string | null
}

/** 支付商返回的数据不可信,统一用这个函数收敛异常 */
export class PaymentProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'PaymentProviderError'
  }
}
