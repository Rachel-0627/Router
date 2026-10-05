/**
 * 密钥读写。对外只暴露两个入口:
 *   getSecret(slot)   取明文 —— 先查库,库里没有就退回环境变量
 *   setSecret(...)    写入 —— 加密后存库,并做往返校验
 *
 * ⚠️ 环境变量兜底是故意保留的:万一 SECRETS_KEK 丢了、库里的全解不开,
 *    你还能回到"在 Vercel 填环境变量"这条老路,服务不会因此停摆。
 */
import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { appSecrets } from '../db/schema-secrets'
import { env } from '../env'
import { logger } from '../logger'
import { encrypt, decrypt, last4 } from './crypto'
import { currentKek, kekByFingerprint, fingerprint, currentFingerprint } from './keys'
import { SLOTS, type SlotName } from './slots'

export { SLOTS, type SlotName }



/** 库里没有时的兜底来源 */
function fromEnv(slot: string): string | undefined {
  const v = (env as unknown as Record<string, unknown>)[slot]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

// ── 缓存:网关每个请求都要取 key,不能每次都查库 ──
type Cached = { value: string | undefined; at: number }
const cache = new Map<string, Cached>()
const TTL_MS = 60_000

export function invalidateSecretCache() {
  cache.clear()
}

/**
 * 取明文。查不到返回 undefined(调用方自己决定是报错还是降级)。
 *
 * ⚠️ 槽位名收 string 而不是联合类型:产品分组是用户自定义的,
 *    每个分组一个密钥槽位,名单在运行时才知道。合法性由调用方校验。
 * 解不开的密文记一条日志但**不抛错** —— 退回环境变量比整个网关挂掉好。
 */
export async function getSecret(slot: string): Promise<string | undefined> {
  const hit = cache.get(slot)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  let value: string | undefined
  try {
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.slot, slot)).limit(1)
    if (row) {
      const key = kekByFingerprint(row.kekFp)
      if (key) {
        value = decrypt(row.ciphertext, key)
      } else {
        logger.error('密钥解不开:找不到对应的 KEK', { slot, kekFp: row.kekFp })
      }
    }
  } catch (e) {
    logger.error('读取密钥失败,退回环境变量', {
      slot,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  value ??= fromEnv(slot)
  cache.set(slot, { value, at: Date.now() })
  return value
}

/**
 * 写入。加密后**立刻解回来比对**,不一致就拒绝保存 ——
 * 宁可现在报错,也不要三个月后要用时才发现存的是一堆解不开的乱码。
 */
export async function setSecret(slot: string, plaintext: string, userId: string): Promise<void> {
  const key = currentKek()
  const ciphertext = encrypt(plaintext, key)
  if (decrypt(ciphertext, key) !== plaintext) {
    throw new Error('加密往返校验失败,已拒绝保存。请检查 SECRETS_KEK 是否配置正确。')
  }

  const row = {
    slot,
    ciphertext,
    kekFp: fingerprint(key),
    last4: last4(plaintext),
    updatedAt: new Date(),
    updatedBy: userId,
  }
  await db.insert(appSecrets).values(row).onConflictDoUpdate({ target: appSecrets.slot, set: row })
  invalidateSecretCache()
  // ⚠️ 日志只记槽位和尾号,明文绝不入日志
  logger.info('密钥已更新', { slot, last4: row.last4, by: userId })
}

export async function deleteSecret(slot: string, userId: string): Promise<void> {
  await db.delete(appSecrets).where(eq(appSecrets.slot, slot))
  invalidateSecretCache()
  logger.info('密钥已删除', { slot, by: userId })
}

/** 页面要的状态:每个槽位配了没、尾号、是不是待重新加密 */
export type SlotStatus = {
  slot: string
  configured: boolean
  source: 'db' | 'env' | 'none'
  last4: string | null
  updatedAt: Date | null
  /** 密文是用旧钥匙加的,需要重新加密 */
  stale: boolean
  /** 密文在,但手上没有能解开它的钥匙 */
  unreadable: boolean
}

export async function slotStatuses(): Promise<SlotStatus[]> {
  const rows = await db.select().from(appSecrets)
  const bySlot = new Map(rows.map((r) => [r.slot, r]))
  const curFp = currentFingerprint()

  return SLOTS.map(({ slot }) => {
    const row = bySlot.get(slot)
    if (!row) {
      const envVal = fromEnv(slot)
      return {
        slot,
        configured: Boolean(envVal),
        source: envVal ? ('env' as const) : ('none' as const),
        last4: envVal ? last4(envVal) : null,
        updatedAt: null,
        stale: false,
        unreadable: false,
      }
    }
    return {
      slot,
      configured: true,
      source: 'db' as const,
      last4: row.last4,
      updatedAt: row.updatedAt,
      stale: curFp !== null && row.kekFp !== curFp,
      unreadable: kekByFingerprint(row.kekFp) === null,
    }
  })
}

/**
 * 把所有用旧钥匙加密的条目换成当前钥匙。
 * 轮换向导第 2 步点的就是这个。返回处理了几条。
 */
export async function reencryptAll(userId: string): Promise<{ done: number; failed: string[] }> {
  const key = currentKek()
  const curFp = fingerprint(key)
  const rows = await db.select().from(appSecrets)
  let done = 0
  const failed: string[] = []

  for (const row of rows) {
    if (row.kekFp === curFp) continue
    const old = kekByFingerprint(row.kekFp)
    if (!old) {
      failed.push(row.slot)
      continue
    }
    const plain = decrypt(row.ciphertext, old)
    await db
      .update(appSecrets)
      .set({ ciphertext: encrypt(plain, key), kekFp: curFp, updatedAt: new Date(), updatedBy: userId })
      .where(eq(appSecrets.slot, row.slot))
    done++
  }
  invalidateSecretCache()
  logger.info('KEK 轮换:重新加密完成', { done, failed: failed.length, by: userId })
  return { done, failed }
}
