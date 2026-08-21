/**
 * 环境变量校验 —— 启动时立刻校验,缺失就直接失败。
 * 目的:不要等到用户点了充值按钮才发现少配了一个密钥。
 *
 * 分两级:
 *   required  当前阶段必须有,缺了直接抛错
 *   optional  后续阶段才用,现在允许为空
 * 每完成一个阶段,把对应变量从 optional 挪到 required。
 */
import { z } from 'zod'

const schema = z.object({
  // ---- 阶段0 必需 ----
  APP_URL: z.string().min(1).default('http://localhost:3000'),
  APP_NAME: z.string().min(1).default('AI Gateway'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未设置,请复制 .env.example 为 .env.local'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ---- 阶段1 起需要 ----
  PRICE_RATIO_OF_OFFICIAL: z.coerce.number().positive().max(1).default(0.3),

  // ---- 阶段2 起需要(现在可空) ----
  NEWAPI_BASE_URL: z.string().optional(),
  NEWAPI_ADMIN_TOKEN: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ---- 阶段3 起需要(现在可空) ----
  CREEM_API_KEY: z.string().optional(),
  CREEM_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),

  // ---- 阶段5 起需要(现在可空) ----
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
})

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`环境变量配置有误:\n${lines.join('\n')}`)
  }
  return parsed.data
}

export const env = load()

/** 某个后续阶段的变量是否已配好,用于功能开关 */
export const featureReady = {
  newapi: () => Boolean(env.NEWAPI_BASE_URL && env.NEWAPI_ADMIN_TOKEN),
  auth: () => Boolean(env.AUTH_SECRET),
  creem: () => Boolean(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET),
  paddle: () => Boolean(env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET),
  alert: () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
}
