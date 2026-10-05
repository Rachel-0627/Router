'use server'
/**
 * 运维密钥的保存 / 测试 / 轮换。
 *
 * 安全约定(每一条都别省):
 *   - 仅管理员。每个 action 开头都要查,不能只靠页面布局挡
 *   - 明文只进加密函数,**绝不写日志、绝不回传给浏览器**
 *   - 保存前校验格式,保存后做加密往返校验
 *   - 删除和轮换都记谁干的
 */
import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { hasOpsAccess } from '@/lib/auth/ops'
import { setSecret, deleteSecret, reencryptAll, getSecret } from '@/lib/secrets/store'
import { isValidSlot } from '@/lib/secrets/slots'
import { logger } from '@/lib/logger'

export type SecretState = { ok: boolean; message: string } | undefined

/** 统一的管理员闸门。返回 userId,没权限就抛。 */
async function requireAdmin(): Promise<string> {
  const [user, ok] = await Promise.all([getCurrentUser(), hasOpsAccess()])
  if (!user || !ok) throw new Error('需要管理员权限')
  return user.id
}

const SaveSchema = z.object({
  // 槽位名单是动态的(每个产品分组一个),不能写死枚举;存在性在下面查
  slot: z.string().min(1).max(64),
  // 上限防手滑粘进整个文件;下限挡空提交
  value: z.string().min(4, { error: '值太短了' }).max(2000, { error: '值太长,确认没粘错东西?' }),
})

export async function saveSecret(_prev: SecretState, form: FormData): Promise<SecretState> {
  let userId: string
  try {
    userId = await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }

  const parsed = SaveSchema.safeParse({
    slot: form.get('slot'),
    value: (form.get('value') ?? '').toString().trim(),
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? '输入有误' }
  }
  const { slot, value } = parsed.data
  if (!(await isValidSlot(slot))) return { ok: false, message: `未知槽位「${slot}」` }

  // 地址类槽位额外校验,免得填个 "zexitongxue.com" 导致转发时拼出畸形 URL
  if (slot === 'NEWAPI_BASE_URL') {
    if (!/^https?:\/\/[^\s/]+$/i.test(value)) {
      return { ok: false, message: '地址要形如 https://zexitongxue.com,不带路径和末尾斜杠' }
    }
  }

  try {
    await setSecret(slot, value, userId)
  } catch (e) {
    // 把真实原因记日志,但只给用户看一句能照着做的话
    logger.error('保存密钥失败', { slot, detail: e instanceof Error ? e.message : String(e) })
    const msg = e instanceof Error && e.message.includes('SECRETS_KEK')
      ? '还没配置加密密钥 SECRETS_KEK,无法保存。按页面底部的说明先配一把。'
      : '保存失败,请稍后重试。'
    return { ok: false, message: msg }
  }

  revalidatePath('/ops-2f8a/credentials')
  return { ok: true, message: '已保存,立刻生效(无需重新部署)' }
}

export async function removeSecret(_prev: SecretState, form: FormData): Promise<SecretState> {
  let userId: string
  try {
    userId = await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }
  const slot = (form.get('slot') ?? '').toString()
  if (!(await isValidSlot(slot))) return { ok: false, message: '未知槽位' }

  await deleteSecret(slot, userId)
  revalidatePath('/ops-2f8a/credentials')
  return { ok: true, message: '已删除。该槽位会退回读环境变量。' }
}

/** 轮换向导第 2 步:把旧钥匙加密的条目换成当前钥匙 */
export async function rotateReencrypt(_prev: SecretState, _form: FormData): Promise<SecretState> {
  let userId: string
  try {
    userId = await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }
  try {
    const { done, failed } = await reencryptAll(userId)
    revalidatePath('/ops-2f8a/credentials')
    if (failed.length > 0) {
      return {
        ok: false,
        message: `${done} 条已重新加密,但 ${failed.length} 条解不开(${failed.join('、')})—— 旧钥匙 SECRETS_KEK_OLD 可能填错或已删掉。`,
      }
    }
    return { ok: true, message: done === 0 ? '本来就都是最新钥匙,无需处理。' : `${done} 条已用新钥匙重新加密。` }
  } catch (e) {
    logger.error('轮换失败', { detail: e instanceof Error ? e.message : String(e) })
    return { ok: false, message: '轮换失败,请检查 SECRETS_KEK 配置。' }
  }
}

/**
 * 轮换向导第 1 步:生成一把新 KEK 给你去 Vercel 粘贴。
 *
 * ⚠️ 这是整个系统里**唯一**会把密钥明文返回给浏览器的地方,
 *    而且只在你主动点按钮时、只回传一次、不落库也不进日志。
 *    必须如此 —— 钥匙存进库就等于挂在锁上,加密全白做。
 */
export async function generateKek(): Promise<{ ok: boolean; kek?: string; message: string }> {
  try {
    await requireAdmin()
  } catch {
    return { ok: false, message: '需要管理员权限' }
  }
  const kek = randomBytes(32).toString('base64')
  logger.info('生成了新的 KEK(明文未记录)')
  return { ok: true, kek, message: '已生成。按下面三步操作,这个值离开本页就看不到了。' }
}
