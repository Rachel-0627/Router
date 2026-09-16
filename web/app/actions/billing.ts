'use server'
/**
 * 发起充值。
 *
 * ⚠️ 顺序不能变:**先建支付会话 → 再写订单行 → 最后才跳转**。
 *    如果反过来(先跳转后写库),用户付了钱而库里没订单,
 *    settlePayment 查不到订单会拒绝入账 —— 那是实打实的赔钱。
 *    现在这个顺序下,写库失败就不跳转,用户根本没机会付款。
 */
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { orders } from '@/lib/db/schema'
import { centsToMicro } from '@/lib/money'
import { getCurrentUser } from '@/lib/auth'
import { getProvider } from '@/lib/payment'
import { site } from '@/lib/site'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkRate } from '@/lib/rate-limit'

export type CheckoutState = { error: string } | undefined

const ALLOWED = site.topupTiers.map((t) => t.amount) as readonly number[]

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Please sign in again.' }

  const amount = z.coerce.number().int().safeParse(formData.get('amount'))
  if (!amount.success || !ALLOWED.includes(amount.data)) {
    return { error: 'Pick one of the available amounts.' }
  }
  const amountCents = amount.data * 100

  const gate = await checkRate(`checkout:${user.id}`, 10, 60 * 60)
  if (!gate.ok) return { error: 'Too many checkout attempts. Try again later.' }

  let paymentUrl: string
  try {
    const provider = getProvider()
    // 我们自己的引用号,带给支付商用于双向核对
    const ourRef = `${user.id.slice(0, 8)}-${Date.now()}`

    // 1) 先在支付商那边建会话
    const session = await provider.createCheckout({
      orderId: ourRef,
      amountCents,
      currency: 'USD',
      userEmail: user.email,
      successUrl: `${env.APP_URL}/dashboard/billing?paid=1`,
      cancelUrl: `${env.APP_URL}/dashboard/billing`,
    })

    // 2) 再写订单行。写失败就不跳转,用户没机会付款
    await db.insert(orders).values({
      userId: user.id,
      provider: provider.name,
      externalId: session.externalId,
      amountCents,
      creditsMicroUsd: centsToMicro(amountCents),
      status: 'pending',
    })

    logger.info('发起充值', { userId: user.id, amountCents, provider: provider.name })
    paymentUrl = session.paymentUrl
  } catch (e) {
    logger.error('发起充值失败', {
      userId: user.id,
      amountCents,
      detail: e instanceof Error ? e.message : String(e),
    })
    return { error: 'Payments are temporarily unavailable. Please try again later.' }
  }

  // 3) redirect 必须在 try 外 —— Next 靠抛异常实现跳转,写在 try 里会被自己 catch 掉
  redirect(paymentUrl)
}
