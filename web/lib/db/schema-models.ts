/**
 * 模型目录表 —— 从代码里的写死清单搬到数据库,让运营后台能自己增删改。
 *
 * 为什么单独一个文件:schema.ts 已经 155 行,加进去要破 200 行铁律。
 *
 * 价格字段设计:
 *   listPrice 四项用独立数值列 —— 扁平、可直接 SQL 查询和排序
 *   分档和各分组进货价用 jsonb —— 结构是嵌套的,拆成列会爆炸
 *   ⚠️ 这些都是**费率**(每百万 token 多少美元),不是金额。
 *      真实扣款仍然在 calculate.ts 里换算成整数 micro USD,不存浮点金额。
 */
import { pgTable, uuid, text, integer, boolean, timestamp, doublePrecision, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import type { PriceTier, TokenPrices, UpstreamGroup } from '../pricing/types'

const rate = (name: string) => doublePrecision(name).notNull()

export const models = pgTable(
  'models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 对外模型 ID,用户在请求里写的 */
    modelId: text('model_id').notNull(),
    /** 上游模型 ID,通常相同 */
    upstreamId: text('upstream_id').notNull(),
    /** 产品分组:claude | codex */
    productGroup: text('product_group').notNull(),

    displayName: text('display_name').notNull(),
    blurb: text('blurb').notNull().default(''),
    contextWindow: integer('context_window').notNull().default(200_000),

    recommended: boolean('recommended').notNull().default(false),
    legacy: boolean('legacy').notNull().default(false),
    /** active = 可售;disabled = 下架但保留(历史账单还要查模型名) */
    status: text('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(100),

    // ── 官方 list 价(短上下文档) ──
    listInput: rate('list_input'),
    listOutput: rate('list_output'),
    listCacheRead: rate('list_cache_read'),
    listCacheWrite: rate('list_cache_write'),

    /** 长上下文档位,如 GPT 系列 272K 翻倍。结构见 PriceTier */
    listPriceTiers: jsonb('list_price_tiers').$type<PriceTier[]>(),
    /** 各上游分组进货价(CNY/百万 token),键是 UpstreamGroup */
    upstreamCny: jsonb('upstream_cny').$type<Partial<Record<UpstreamGroup, TokenPrices>>>().notNull(),

    /**
     * 单模型倍率覆盖。空 = 跟所属分组的倍率走。
     * 用来给个别模型微调(比如某个模型进货特别便宜,可以打更低的折)。
     */
    ratioOverride: doublePrecision('ratio_override'),

    /** 价格最后一次和上游核对的时间,给 check-pricing 用 */
    pricesVerifiedAt: timestamp('prices_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 对外模型 ID 必须唯一 —— 网关靠它查价,重复了就不知道按哪个算钱
    uniqueIndex('models_model_id_uq').on(t.modelId),
    index('models_group_idx').on(t.productGroup, t.status),
  ],
)

export type ModelRow = typeof models.$inferSelect
export type NewModelRow = typeof models.$inferInsert

/**
 * 产品分组的可调设置 —— 倍率和上架状态存库,后台能改。
 *
 * 其余属性(显示名、介绍、降级链)仍在 lib/pricing/groups.ts 的代码里,
 * 因为那些改动频率极低,而且降级链和上游渠道配置强相关,不该让人随手改。
 */
/**
 * 产品分组 —— 用户建 key 时选的那个,决定这把 key 能调哪些模型、按什么倍率计价。
 *
 * 这张表就是分组的**唯一真相**:新增一条就是新开一条产品线,不用改代码。
 * lib/pricing/groups.ts 里的常量只在表为空时兜底(全新环境首次启动)。
 *
 * ⚠️ 别和「上游分组」混了。上游分组(VIP/特价/自建)是进货渠道,
 *    用户永远看不到,记在每个模型的 upstreamCny 里。
 */
export const productGroupSettings = pgTable('product_group_settings', {
  /** 小写短标识,如 claude / codex / glm。建了就不该再改 —— 已发出去的 key 绑着它 */
  groupId: text('group_id').primaryKey(),
  /** 给用户看的名字,如 "Claude" */
  displayName: text('display_name').notNull().default(''),
  /** 一句话介绍,显示在定价页和建 key 页 */
  blurb: text('blurb').notNull().default(''),
  /** 售价倍率:0.8 = 官方价八折 */
  ratio: doublePrecision('ratio').notNull(),
  /** live = 可购买;pending = 页面展示但不可用 */
  status: text('status').notNull().default('pending'),
  /**
   * 这个分组用哪把上游 key(app_secrets 的槽位名)。
   * 空则退回通用的 NEWAPI_SERVICE_KEY。
   */
  secretSlot: text('secret_slot').notNull().default(''),
  /**
   * 转发给上游时用哪种协议。Claude 系走 anthropic,GPT 系走 openai。
   * 发错格式上游会直接报错,所以必须按分组记住。
   */
  protocol: text('protocol').notNull().default('anthropic'),
  /** 页面显示顺序,小的在前 */
  sortOrder: doublePrecision('sort_order').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type GroupSettingRow = typeof productGroupSettings.$inferSelect
