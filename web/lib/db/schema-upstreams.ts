/**
 * 上游供应商 —— 我们从哪儿进货。
 *
 * 为什么单独一张表,而不是像以前那样塞进密钥表的一个槽位:
 *   地址**不是秘密**,没必要加密;更要命的是"一个槽位"注定只能存一个值,
 *   想接第二家供应商就无路可走。单一上游是实打实的经营风险 ——
 *   号池会周期性故障,只有一家时没有退路。
 *
 * ⚠️ 这里**只存地址和怎么鉴权**,key 本身仍然加密存在 app_secrets,
 *    按产品分组一把(见 product_group_settings.secret_slot)。
 *
 * ⚠️ 本表不负责**跨上游自动故障转移**(A 挂了自动走 B)。那要处理重试、
 *    计费归属、成本记账,不是加个字段能解决的。现在只做"能挂多个、能手动切"。
 */
import { pgTable, text, doublePrecision, timestamp } from 'drizzle-orm/pg-core'

export const upstreams = pgTable('upstreams', {
  /** 小写短标识,如 zexitongxue / anthropic。建后不该改 —— 分组指着它 */
  id: text('id').primaryKey(),
  /** 给自己看的名字,如「泽西同学」 */
  displayName: text('display_name').notNull().default(''),
  /** 根地址,如 https://zexitongxue.com(末尾不带斜杠) */
  baseUrl: text('base_url').notNull(),
  /**
   * 怎么把 key 放进请求头。各家不一样,写死一种就等于只能接一家:
   *   bearer     Authorization: Bearer <key>   new-api 系、OpenAI 官方
   *   x-api-key  x-api-key: <key>              Anthropic 官方
   *   raw        Authorization: <key>          部分中转站
   */
  authStyle: text('auth_style').notNull().default('bearer'),
  /** 自己记的备注:进货渠道、结算方式、联系人之类 */
  note: text('note').notNull().default(''),
  sortOrder: doublePrecision('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UpstreamRow = typeof upstreams.$inferSelect
