/**
 * 数据库表定义(Postgres)
 *
 * 金额单位约定 —— 全项目统一,不要出现浮点数:
 *   micro USD  百万分之一美元。$1 = 1_000_000。用 bigint 存。
 *              选它是因为单次请求可能只花 $0.0001,用「分」精度不够。
 *   cents      美分。只用在支付订单上(支付平台都用美分)。
 *
 * ⚠️ 铁律:credit_ledger 只追加不修改,余额 = 流水求和。
 *    不要加「balance」字段 —— 并发下改余额字段必然对不上账。
 */
import {
  pgTable, uuid, text, timestamp, integer, bigint, date,
  index, uniqueIndex,
} from 'drizzle-orm/pg-core'

const money = (name: string) => bigint(name, { mode: 'number' })

/** 用户 —— 身份归我们,额度归 new-api,靠 newapi_user_id 映射 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),            // OAuth 用户为空
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    newapiUserId: integer('newapi_user_id'),        // new-api 里对应的用户 ID
    status: text('status').notNull().default('active'), // active | suspended
    /** user | admin。admin 才能进 /ops-2f8a,用 npm run ops:grant <邮箱> 授权 */
    role: text('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
)

/** 支付订单 —— (provider, external_id) 唯一索引是 webhook 幂等的根基 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    provider: text('provider').notNull(),            // creem | paddle
    externalId: text('external_id').notNull(),       // 支付平台的订单号
    amountCents: integer('amount_cents').notNull(),  // 用户实付
    creditsMicroUsd: money('credits_micro_usd').notNull(), // 应到账额度
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('pending'), // pending|paid|failed|refunded
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    // ⚠️ 幂等核心:同一个支付平台订单只能入账一次
    uniqueIndex('orders_provider_external_uq').on(t.provider, t.externalId),
    index('orders_user_idx').on(t.userId, t.createdAt),
  ],
)

/** 额度流水 —— APPEND ONLY,永远不 UPDATE 不 DELETE */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    deltaMicroUsd: money('delta_micro_usd').notNull(), // 正=充值 负=消费
    type: text('type').notNull(),        // topup | usage | refund | adjustment
    refType: text('ref_type'),           // order | usage_daily | null
    refId: text('ref_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_user_time_idx').on(t.userId, t.createdAt)],
)

/** API Key —— 明文 key 不落库,只存前缀用于展示 + new-api 的 token id */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    /**
     * 产品分组:'claude' | 'codex'。决定这把 key 能调哪些模型、
     * 走哪个上游服务令牌、按哪个倍率计价。见 lib/pricing/groups.ts
     */
    productGroup: text('product_group').notNull().default('claude'),
    // A 方案下不再给每个用户在 new-api 开 token,此列保留但不用
    newapiTokenId: integer('newapi_token_id'),
    // ⚠️ 明文 key 只在创建时返回给用户一次,库里只存 SHA-256
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix'),                   // 如 sk-gr-ab12...yz89
    dailyLimitMicroUsd: money('daily_limit_micro_usd'), // 空 = 不限
    status: text('status').notNull().default('active'), // active | disabled
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    index('api_keys_user_idx').on(t.userId),
    // 每次网关请求都按哈希查 key,必须有唯一索引
    uniqueIndex('api_keys_hash_uq').on(t.keyHash),
  ],
)

/** 每日用量汇总 —— 从 new-api 日志聚合而来,只存 token 数,不存内容 */
export const usageDaily = pgTable(
  'usage_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    day: date('day').notNull(),
    model: text('model').notNull(),
    requests: integer('requests').notNull().default(0),
    inputTokens: money('input_tokens').notNull().default(0),
    outputTokens: money('output_tokens').notNull().default(0),
    cacheReadTokens: money('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: money('cache_write_tokens').notNull().default(0),
    costMicroUsd: money('cost_micro_usd').notNull().default(0),      // 我们的进货成本
    revenueMicroUsd: money('revenue_micro_usd').notNull().default(0), // 向用户收的
  },
  (t) => [uniqueIndex('usage_daily_uq').on(t.userId, t.day, t.model)],
)

/**
 * 渠道探测记录 —— Status 页和 24h 可用率的数据源。
 *
 * 为什么要自己存一份而不是直接读 new-api:
 *   new-api 只保留渠道的**当前**状态,没有历史。
 *   但"过去 24 小时可用率"才是用户真正关心的 —— 号池会周期性炸,
 *   只显示"此刻正常"会掩盖一天挂了六次的事实。
 *
 * 只追加,不修改。定期清理旧数据(保留 30 天足够)。
 */
export const channelProbes = pgTable(
  'channel_probes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    /** new-api 里的渠道 id */
    channelId: integer('channel_id').notNull(),
    channelName: text('channel_name').notNull(),
    /** 上游分组名,如 VIP / 默认分组 */
    upstreamGroup: text('upstream_group'),
    model: text('model'),
    ok: text('ok').notNull(),              // 'up' | 'down'
    latencyMs: integer('latency_ms'),
    /** 失败原因,只存短码不存完整堆栈 */
    errorCode: text('error_code'),
  },
  (t) => [index('probes_time_idx').on(t.checkedAt), index('probes_channel_idx').on(t.channelId, t.checkedAt)],
)

export type ChannelProbe = typeof channelProbes.$inferSelect
export type User = typeof users.$inferSelect
export type Order = typeof orders.$inferSelect
export type LedgerEntry = typeof creditLedger.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type UsageDaily = typeof usageDaily.$inferSelect

// 模型目录单独一个文件(本文件已接近 200 行上限),在这里再导出一次,
// 这样 import { models } from './'"db/schema"' 仍然可用。
export { models, productGroupSettings, type ModelRow, type NewModelRow, type GroupSettingRow } from './schema-models'
// 运维密钥(上游 key / 支付 key)也单独一个文件,原因同上。
export { appSecrets, type AppSecretRow } from './schema-secrets'

// 上游供应商(地址+鉴权方式)也单独一个文件。
export { upstreams, type UpstreamRow } from './schema-upstreams'
