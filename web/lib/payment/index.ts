/**
 * 支付通道选择。
 * 换支付商只改环境变量 PAYMENT_PROVIDER,业务代码不动。
 */
import { env } from '../env'
import { nexapay } from './nexapay'
import type { PaymentProvider } from './provider'

const PROVIDERS: Record<string, PaymentProvider> = {
  nexapay,
  // creem / paddle 待接入时在这里注册
}

export function getProvider(name?: string): PaymentProvider {
  const key = name ?? env.PAYMENT_PROVIDER
  const p = PROVIDERS[key]
  if (!p) {
    throw new Error(
      `支付通道 "${key}" 未注册。已注册: ${Object.keys(PROVIDERS).join(', ') || '(无)'}`,
    )
  }
  return p
}

export * from './provider'
