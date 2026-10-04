/**
 * KEK(密钥加密密钥)管理。
 *
 * 轮换时环境变量里会同时存在两把:
 *   SECRETS_KEK      当前这把,新写入一律用它
 *   SECRETS_KEK_OLD  上一把,只用来解开还没重新加密的旧密文
 *
 * ⚠️ 这里用「钥匙指纹」而不是版本号来标记密文是谁加的。
 *    版本号要额外维护一个计数器,一旦它和实际钥匙对不上就会出
 *    "明明钥匙在手却解不开"这种极难排查的问题。指纹是从钥匙本身
 *    算出来的,天然不会错位。
 */
import { createHash } from 'node:crypto'
import { env } from '../env'

/** KEK 必须是 32 字节。接受 base64 或 hex;长度不对直接报错,不悄悄截断。 */
function parseKek(raw: string, label: string): Buffer {
  const trimmed = raw.trim()
  for (const enc of ['base64', 'hex'] as const) {
    const buf = Buffer.from(trimmed, enc)
    if (buf.length === 32) return buf
  }
  throw new Error(`${label} 不是 32 字节密钥。用 openssl rand -base64 32 生成一把。`)
}

/**
 * 钥匙的短指纹。存指纹不存钥匙,泄露指纹推不出钥匙
 * (SHA-256 不可逆,且只取前 8 位十六进制)。
 */
export function fingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8)
}

/** 写新密文用的那把 */
export function currentKek(): Buffer {
  if (!env.SECRETS_KEK) {
    throw new Error('未配置 SECRETS_KEK,无法保存密钥。先在 Vercel 环境变量里加上。')
  }
  return parseKek(env.SECRETS_KEK, 'SECRETS_KEK')
}

/** 解密时按指纹找钥匙 —— 当前的和轮换中的旧的都试 */
export function kekByFingerprint(fp: string): Buffer | null {
  for (const [raw, label] of [
    [env.SECRETS_KEK, 'SECRETS_KEK'],
    [env.SECRETS_KEK_OLD, 'SECRETS_KEK_OLD'],
  ] as const) {
    if (!raw) continue
    try {
      const key = parseKek(raw, label)
      if (fingerprint(key) === fp) return key
    } catch {
      // 某一把配错了不该拖累另一把,继续试
    }
  }
  return null
}

export const hasKek = () => Boolean(env.SECRETS_KEK)
export const hasOldKek = () => Boolean(env.SECRETS_KEK_OLD)

/** 当前钥匙的指纹;没配 KEK 返回 null */
export function currentFingerprint(): string | null {
  try {
    return hasKek() ? fingerprint(currentKek()) : null
  } catch {
    return null // KEK 格式错 —— 页面会显示成"未配置",引导你重新生成
  }
}
