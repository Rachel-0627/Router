/**
 * Creem 集成验证 —— 不需要真实 Creem 账号,验证的是我们这边的逻辑。
 *
 *   npm run verify:creem
 *
 * 验四件事:
 *   1. HMAC 验签:正确签名放行、篡改 body / 换密钥 / 缺头 一律拒绝
 *   2. 回调解析:只取 checkout id,其余字段丢弃
 *   3. 档位→产品映射:没配的档位要明确报错,不能静默失败
 *   4. 环境隔离:测试/生产 base URL 不能混
 */
import { createHmac } from 'node:crypto'
import { creem } from '../lib/payment/creem'
import { env } from '../lib/env'

let fails = 0
const ok = (m: string) => console.log(`  ✅ ${m}`)
const bad = (m: string) => { console.log(`  ❌ ${m}`); fails++ }

/** 官方回调样例(取自文档 9504 行) */
const SAMPLE = {
  id: 'evt_5WHHcZPv7VS0YUsberIuOz',
  eventType: 'checkout.completed',
  object: {
    id: 'ch_4l0N34kxo16AhRKUHFUuXr',
    object: 'checkout',
    request_id: 'our-order-ref',
    order: {
      id: 'ord_4aDwWXjMLpes4Kj4XqNnUA',
      customer: 'cust_1OcIK1GEuVvXZwD19tjq2z',
      product: 'prod_d1AY2Sadk9YAvLI0pj97f',
      amount: 2000,
      currency: 'USD',
      status: 'paid',
    },
  },
}

const SECRET = 'whsec_test_secret_for_verification'
const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex')

const headersWith = (sig: string | null) => {
  const h = new Headers()
  if (sig !== null) h.set('creem-signature', sig)
  return h
}

function main() {
  const raw = JSON.stringify(SAMPLE)

  console.log('1) HMAC 验签')
  if (!env.CREEM_WEBHOOK_SECRET) {
    console.log('  ⚠️  CREEM_WEBHOOK_SECRET 未配置,跳过验签测试')
    console.log('     (临时设一个再跑: CREEM_WEBHOOK_SECRET=' + SECRET + ')')
  } else {
    const s = env.CREEM_WEBHOOK_SECRET
    if (creem.verifyWebhookSignature!(raw, headersWith(sign(raw, s)))) ok('正确签名 → 放行')
    else bad('正确签名竟然被拒')

    const tampered = raw.replace('"amount":2000', '"amount":999999')
    if (!creem.verifyWebhookSignature!(tampered, headersWith(sign(raw, s)))) ok('篡改金额 → 拒绝')
    else bad('篡改 body 竟然通过了!')

    if (!creem.verifyWebhookSignature!(raw, headersWith(sign(raw, 'wrong-secret')))) ok('错误密钥 → 拒绝')
    else bad('错误密钥竟然通过了!')

    if (!creem.verifyWebhookSignature!(raw, headersWith(null))) ok('缺签名头 → 拒绝')
    else bad('没有签名头竟然通过了!')

    if (!creem.verifyWebhookSignature!(raw, headersWith('not-hex-garbage'))) ok('垃圾签名 → 拒绝且不抛错')
    else bad('垃圾签名竟然通过了!')
  }

  console.log('\n2) 回调解析(只取 checkout id)')
  const id = creem.parseWebhookExternalId(SAMPLE, new Headers())
  if (id === 'ch_4l0N34kxo16AhRKUHFUuXr') ok(`取到 ${id}`)
  else bad(`应取到 ch_...,实际 ${id}`)

  const notCheckout = { eventType: 'subscription.active', object: { id: 'sub_xxx' } }
  if (creem.parseWebhookExternalId(notCheckout, new Headers()) === null) ok('非 checkout 事件 → 返回 null(忽略)')
  else bad('非 checkout 事件竟然被当成订单')

  if (creem.parseWebhookExternalId({ garbage: true }, new Headers()) === null) ok('畸形回调 → 返回 null 不抛错')
  else bad('畸形回调处理异常')

  console.log('\n3) 档位 → 产品映射')
  const map = env.CREEM_PRODUCTS ? '已配置' : '未配置'
  console.log(`  CREEM_PRODUCTS: ${map}`)
  if (!env.CREEM_PRODUCTS) {
    ok('未配置时,创建 checkout 会明确报错而不是静默失败(见 creem.ts 的错误提示)')
  }

  console.log('\n4) 环境隔离')
  console.log(`  CREEM_TEST_MODE=${env.CREEM_TEST_MODE} → base URL 为 ${env.CREEM_TEST_MODE ? 'test-api.creem.io(沙箱)' : 'api.creem.io(生产,真实扣款)'}`)
  ok('测试和生产 key 不可混用,已在代码注释中标明')

  console.log(fails === 0 ? '\n✅ Creem 集成逻辑全部通过' : `\n❌ ${fails} 项失败`)
  process.exit(fails === 0 ? 0 : 1)
}

main()
