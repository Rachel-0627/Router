/**
 * 密钥槽位 —— 后台「密钥配置」页上能填的那些框。
 *
 * 分两类:
 *   固定槽位  上游地址、支付密钥。和产品分组无关,写死在这里
 *   分组槽位  每个产品分组一把上游 key。**由分组表动态生成** ——
 *             后台新开一条产品线,这里自动多一个框,不用改代码
 *
 * 槽位名和环境变量同名,这样「库里没有就退回环境变量」的兜底
 * 不用再维护一张映射表。
 */
import { getGroups, defaultSlotForGroup } from '../pricing/groups'

export { defaultSlotForGroup }

export type SlotDef = {
  slot: string
  label: string
  hint: string
  /** true = 密文框,页面只显示尾号;false = 明文显示 */
  secret: boolean
  kind: 'upstream' | 'group' | 'payment'
  /** kind='group' 时:这条产品线挂在哪个上游下,页面按它分块 */
  upstreamId?: string
  groupId?: string
}

/** 和分组无关的固定槽位 */
// ⚠️ 上游地址**不在这里**。它不是秘密,而且存成"一个槽位"注定只能有一个值 ——
//    已搬进 upstreams 表,支持挂多家供应商。
export const FIXED_SLOTS: SlotDef[] = [
  {
    slot: 'NEWAPI_SERVICE_KEY',
    label: '通用上游 key(兜底)',
    hint: '分组没指定自己的 key 时用这把。只有一条产品线时填这个就够',
    secret: true,
    kind: 'upstream',
  },
  {
    slot: 'NOWPAYMENTS_API_KEY',
    label: 'NOWPayments API Key',
    hint: '控制台 Settings → Payments → API keys。注意不是 Public key',
    secret: true,
    kind: 'payment',
  },
  {
    slot: 'NOWPAYMENTS_IPN_SECRET',
    label: 'NOWPayments IPN 密钥',
    hint: '控制台 Settings → Instant payment notifications。验回调签名用,填错会导致充值到不了账',
    secret: true,
    kind: 'payment',
  },
  {
    slot: 'CREEM_API_KEY',
    label: 'Creem API Key(备用)',
    hint: '等商户审核批了再填。测试阶段用 Test Mode 的 key',
    secret: true,
    kind: 'payment',
  },
  {
    slot: 'CREEM_WEBHOOK_SECRET',
    label: 'Creem Webhook 密钥(备用)',
    hint: '验回调签名用',
    secret: true,
    kind: 'payment',
  },
]

/**
 * 当前全部槽位 = 固定槽位 + 每个分组一个。
 * 分组没指定 secretSlot 的,按默认命名给一个。
 */
export async function allSlots(): Promise<SlotDef[]> {
  const groups = await getGroups()
  const groupSlots: SlotDef[] = groups.map((g) => ({
    slot: g.secretSlot || defaultSlotForGroup(g.id),
    label: `${g.displayName} 组上游 key`,
    hint: '这条产品线用哪把上游 key。key 绑的上游分组决定进货价,不要和别的组混用',
    secret: true,
    kind: 'group' as const,
    upstreamId: g.upstreamId,
    groupId: g.id,
  }))
  // 两个分组万一指到同一个槽位,只留一个框
  const seen = new Set<string>()
  return [...FIXED_SLOTS, ...groupSlots].filter((s) => {
    if (seen.has(s.slot)) return false
    seen.add(s.slot)
    return true
  })
}

/** 这个槽位名合法吗 —— 替代原来写死的 SLOT_NAMES 数组 */
export async function isValidSlot(slot: string): Promise<boolean> {
  return (await allSlots()).some((s) => s.slot === slot)
}
