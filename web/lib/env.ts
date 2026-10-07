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
  // 阶段1 营销站不用数据库;阶段3 接认证时改回必填
  DATABASE_URL: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ---- 阶段1 起需要 ----
  // 默认值必须和 Vercel 线上一致,否则漏配变量时会静默按别的倍率卖,
  // 不报错但毛利差一大截。
  // 全局兜底倍率(没有按组配置时用)。八折定案,见 docs/定价设计.md
  PRICE_RATIO_OF_OFFICIAL: z.coerce.number().positive().max(1).default(0.8),
  // 按产品分组的倍率覆盖。不配就用 lib/pricing/groups.ts 里的默认值。
  // 调价改这里,不用改代码。
  PRICE_RATIO_CLAUDE: z.coerce.number().positive().max(1).optional(),
  PRICE_RATIO_CODEX: z.coerce.number().positive().max(1).optional(),

  // ---- 阶段3 起需要(现在可空) ----
  NEWAPI_BASE_URL: z.string().optional(),
  // 二选一:系统访问令牌(不过期,推荐),或管理员账号密码(实测登录拿 JWT)
  NEWAPI_ADMIN_TOKEN: z.string().optional(),
  NEWAPI_ADMIN_USER: z.string().optional(),
  NEWAPI_ADMIN_PASSWORD: z.string().optional(),
  // 代理层转发用的服务令牌。**每个产品分组一个** —— 令牌上的分组决定
  // new-api 往哪批渠道路由。需你在 new-api 界面手动建好再填进来,
  // 因为它的接口永远不返回明文 key,拿不到就只能人工复制。
  NEWAPI_SERVICE_KEY: z.string().optional(),          // 兜底(没配分组专属时用)
  NEWAPI_SERVICE_KEY_CLAUDE: z.string().optional(),
  NEWAPI_SERVICE_KEY_CODEX: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  // 运营后台 /ops-2f8a 的独立口令。**不要**和 AUTH_SECRET 相同 ——
  // 用户会话泄露不该等于运营数据泄露。生成: openssl rand -base64 24
  OPS_ACCESS_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ---- 运维密钥加密(SECRETS_KEK)----
  // 后台填写的上游 key / 支付 key 用它加密后存库。生成: openssl rand -base64 32
  //
  // ⚠️ **不要**复用 AUTH_SECRET。那把是签登录凭证的,怀疑会话泄露时应该
  //    随时能换;两者绑一起会导致"换登录密钥 = 毁掉所有上游 key",
  //    结果就是你不敢做本该做的安全操作。
  //
  // ⚠️ 这把钥匙丢了,库里的密钥全部解不开,只能重填一次。值得单独备份。
  //    (真丢了也不会停摆 —— 下面的环境变量兜底路径仍然有效。)
  SECRETS_KEK: z.string().optional(),
  // 轮换期间临时存放上一把 KEK,让旧密文还能解开。轮换完请删掉。
  SECRETS_KEK_OLD: z.string().optional(),

  // ---- 阶段4 支付(现在可空) ----
  /** 主力通道 */
  // nexapay 已下线:实测它是 $79/月的订阅制入金聚合器,不是按笔收费的网关,
  // 且其通道(Transak/Banxa/Ramp)要求**终端用户做 KYC**。两个坑都占,不用。
  PAYMENT_PROVIDER: z.enum(['nowpayments', 'creem', 'paddle']).default('nowpayments'),
  /** 加密货币收款。按笔 1%,无月费,无需公司主体 —— 个人身份唯一走得通的通道 */
  NOWPAYMENTS_API_KEY: z.string().optional(),
  /** IPN 回调验签密钥。⚠️ 和 API Key 是两个不同的值,别填反 */
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  /** webhook 路径里的随机段,防止回调地址被猜到 */
  PAYMENT_WEBHOOK_PATH_SECRET: z.string().optional(),
  CREEM_API_KEY: z.string().optional(),
  CREEM_WEBHOOK_SECRET: z.string().optional(),
  /** 测试环境开关。测试 key 只能配 test-api.creem.io,不能混用 */
  CREEM_TEST_MODE: z.coerce.boolean().default(false),
  /** 充值档位 → Creem 产品 ID 的映射,如 {"20":"prod_a","50":"prod_b","200":"prod_c"} */
  CREEM_PRODUCTS: z.string().optional(),
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
  db: () => Boolean(env.DATABASE_URL),
  // 令牌或账号密码,二者有其一即可
  newapi: () =>
    Boolean(env.NEWAPI_BASE_URL && (env.NEWAPI_ADMIN_TOKEN || (env.NEWAPI_ADMIN_USER && env.NEWAPI_ADMIN_PASSWORD))),
  auth: () => Boolean(env.AUTH_SECRET),
  ops: () => Boolean(env.OPS_ACCESS_KEY && env.AUTH_SECRET),
  nowpayments: () => Boolean(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET),
  creem: () => Boolean(env.CREEM_API_KEY && env.CREEM_WEBHOOK_SECRET),
  paddle: () => Boolean(env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET),
  alert: () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  /** 配了 KEK 才能在后台存密钥;没配就只能走环境变量 */
  secrets: () => Boolean(env.SECRETS_KEK),
}
