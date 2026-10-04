/**
 * 运维密钥存储 —— 上游 key、支付 key 等,由管理员在后台页面填写。
 *
 * 为什么不直接用环境变量:
 *   环境变量改一次要重新部署(2-3 分钟)。上游 key 被盗刷时你要的是
 *   10 秒就能换掉,不是 3 分钟。存库可以立刻生效。
 *
 * ⚠️ 库里**只存密文**。加密密钥(KEK)在环境变量 SECRETS_KEK 里,
 *    故意不进数据库 —— 否则数据库被导出,钥匙和锁一起泄露,加密白做。
 *
 * ⚠️ KEK 和 AUTH_SECRET 是两把不同的钥匙,不许混用:
 *    AUTH_SECRET 是签登录凭证的,怀疑会话泄露时**应该随时能换**。
 *    如果加密也挂在它身上,换它就等于毁掉所有 key —— 那会让你
 *    不敢做本该做的安全操作。两者分家,各管各的。
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './schema'

export const appSecrets = pgTable('app_secrets', {
  /** 槽位名,和环境变量同名,如 NEWAPI_SERVICE_KEY_CLAUDE */
  slot: text('slot').primaryKey(),
  /** base64(iv ‖ authTag ‖ 密文),AES-256-GCM */
  ciphertext: text('ciphertext').notNull(),
  /**
   * 加密这条密文的那把钥匙的指纹(8 位十六进制)。
   * 轮换时靠它找对应的钥匙解密;和当前钥匙指纹不一致 = 这条待重新加密。
   * 存指纹不存钥匙,泄露它推不出原钥匙。
   */
  kekFp: text('kek_fp').notNull(),
  /** 尾号,给页面显示用(如 a3f9)。不足以反推原文 */
  last4: text('last4').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
})

export type AppSecretRow = typeof appSecrets.$inferSelect
