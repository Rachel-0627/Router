/**
 * 在 Creem 里建好三个充值档位的产品,并打印出要填进环境变量的映射。
 *
 *   npm run creem:setup          # 测试环境(默认,推荐先跑这个)
 *   npm run creem:setup -- --live # 生产环境
 *
 * 为什么要脚本:Creem 按「产品」收款,每个档位要建一个产品,再把产品 ID
 * 抄进配置。手抄 ID 容易错,错了就是用户点充值直接报错。脚本建完直接给你
 * 可以粘贴的一行。
 *
 * 重复跑是安全的:同名产品已存在就跳过,不会建重复的。
 */
import { site } from '../lib/site'
import { env } from '../lib/env'

const TEST_BASE = 'https://test-api.creem.io'
const PROD_BASE = 'https://api.creem.io'

const live = process.argv.includes('--live')
const base = live ? PROD_BASE : TEST_BASE

type Product = { id: string; name: string; price?: number }

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const key = env.CREEM_API_KEY
  if (!key) {
    console.error('❌ CREEM_API_KEY 未配置。去 Creem 后台 Developers 页面拿 key 填进 .env.local')
    process.exit(2)
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 260)}`)
  return text ? JSON.parse(text) : {}
}

async function listProducts(): Promise<Product[]> {
  const d = (await api('/v1/products?page_size=100')) as Record<string, unknown>
  const items = (d.items ?? d.data ?? []) as Record<string, unknown>[]
  return items.map((p) => ({ id: String(p.id), name: String(p.name ?? ''), price: Number(p.price ?? 0) }))
}

async function main() {
  console.log(`环境: ${live ? '🔴 生产' : '🧪 测试'}  (${base})\n`)

  let existing: Product[] = []
  try {
    existing = await listProducts()
    console.log(`已有 ${existing.length} 个产品`)
  } catch (e) {
    console.error('❌ 连不上 Creem 或 key 无效:', e instanceof Error ? e.message : e)
    console.error(live ? '   (--live 需要生产 key)' : '   (测试环境需要测试 key,在后台左下角切到 Test Mode 拿)')
    process.exit(1)
  }

  const map: Record<string, string> = {}
  for (const tier of site.topupTiers) {
    const name = `${site.name} Credits $${tier.amount}`
    const hit = existing.find((p) => p.name === name)
    if (hit) {
      console.log(`  ⏭  已存在 ${name} → ${hit.id}`)
      map[String(tier.amount)] = hit.id
      continue
    }
    const created = (await api('/v1/products', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: `$${tier.amount} of prepaid API credits for ${site.name}. Credits never expire.`,
        // Creem 金额单位是分
        price: tier.amount * 100,
        currency: 'USD',
        billing_type: 'onetime',
      }),
    })) as Record<string, unknown>
    const id = String(created.id ?? '')
    if (!id) throw new Error(`建 ${name} 没返回 id: ${JSON.stringify(created).slice(0, 200)}`)
    console.log(`  ✅ 新建 ${name} → ${id}`)
    map[String(tier.amount)] = id
  }

  console.log('\n把下面这行填进 .env.local(或 Vercel 环境变量):\n')
  console.log(`CREEM_PRODUCTS=${JSON.stringify(map)}`)
  if (!live) console.log('CREEM_TEST_MODE=true')
  console.log('\n还需要配:')
  console.log('  CREEM_API_KEY        Creem 后台 Developers 页')
  console.log('  CREEM_WEBHOOK_SECRET Creem 后台 Developers > Webhook 页')
  console.log(`  回调地址填:${env.APP_URL}/api/webhook/creem/<PAYMENT_WEBHOOK_PATH_SECRET>`)
  process.exit(0)
}

main().catch((e) => {
  console.error('\n❌ 失败:', e instanceof Error ? e.message : e)
  process.exit(1)
})
