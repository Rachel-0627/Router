/**
 * 密钥的加解密 —— AES-256-GCM。
 *
 * 选 GCM 而不是 CBC:GCM 自带完整性校验(authTag)。密文被改过一个字节
 * 解密就会直接抛错,而不是悄悄返回一段乱码当成 key 拿去用。
 *
 * 密文格式:base64( iv[12] ‖ authTag[16] ‖ 密文 )
 * 三段拼一起存一个字段,省得维护三列还要保证它们同进同出。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const IV_LEN = 12   // GCM 的标准长度,不要改
const TAG_LEN = 16

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function decrypt(packed: string, key: Buffer): string {
  const buf = Buffer.from(packed, 'base64')
  if (buf.length <= IV_LEN + TAG_LEN) throw new Error('密文格式不对(太短)')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** 页面显示用的尾号。太短的值不显示尾号,免得等于把整个值露出来。 */
export function last4(value: string): string {
  return value.length >= 8 ? value.slice(-4) : '••••'
}
