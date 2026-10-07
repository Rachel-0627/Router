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
   *
   * @param externalId 我们订单表里存的那个 ID(创建支付时拿到的)
   * @param handle     可选的回查句柄,来自 parseWebhookVerifyHandle。
   *                   有些支付商不支持按"创建时的 ID"查状态,只能按
   *                   "付款发生后才生成的 ID"查 —— NOWPayments 就是这样:
   *                   按 invoice 查要 JWT(得存账号密码,不可接受),
   *                   按 payment_id 查只要 API key。
   */
  verifyPayment(externalId: string, handle?: string): Promise<VerifiedPayment>

  /**
   * 从 webhook 里**只**提取订单号。
   * 其他字段一律丢弃 —— 拿到 ID 后走 verifyPayment 回查。
   * 返回 null 表示这个 webhook 无法识别,应当忽略。
   */
  parseWebhookExternalId(body: unknown, headers: Headers): string | null

  /**
   * 从 webhook 里取出**回查用的句柄**(如 payment_id)。可选。
   *
   * 为什么需要它:订单匹配用的 ID 和回查用的 ID 不一定是同一个。
   * 没有它的话,要么存支付商的登录密码去换 JWT(危险),
   * 要么直接信 webhook 里的金额(违反本层的核心原则)。
   */
  parseWebhookVerifyHandle?(body: unknown): string | null

  /**
   * 验证 webhook 签名。支付商支持签名的**必须**实现。
   *
   * ⚠️ 参数是**原始请求体字符串**,不是解析后的对象 ——
   *    HMAC 算的是原始字节,JSON.parse 再 stringify 会改变空格和键序,签名必然对不上。
   *
   * 不实现(返回 undefined)表示该支付商不提供签名,
   * 此时只能靠回调地址里的路径密钥 + 回查校验兜底。
   */
  //
  // ⚠️ 允许返回 Promise:密钥存在加密库里,读它是异步的。
  verifyWebhookSignature?(rawBody: string, headers: Headers): boolean | Promise<boolean>
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
