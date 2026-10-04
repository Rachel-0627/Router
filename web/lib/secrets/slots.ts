/**
 * 后台能填的密钥槽位。槽位名**和环境变量同名**,
 * 这样"库里没有就退回环境变量"的兜底逻辑不用再维护一张映射表。
 *
 * 顺序就是页面上的显示顺序。
 */
export const SLOTS = [
  {
    slot: 'NEWAPI_BASE_URL',
    label: '上游地址',
    hint: '直连上游填 https://zexitongxue.com(末尾不要带斜杠)',
    secret: false,            // 不是密钥,页面上明文显示
    group: 'claude',          // 「测试连接」时用哪个分组去探
  },
  {
    slot: 'NEWAPI_SERVICE_KEY_CLAUDE',
    label: 'Claude 组上游 key',
    hint: '上游那把绑定 Claude 分组的 key。分组决定进货价,不能和 Codex 混用',
    secret: true,
    group: 'claude',
  },
  {
    slot: 'NEWAPI_SERVICE_KEY_CODEX',
    label: 'Codex 组上游 key',
    hint: '上游那把绑定 Codex 分组的 key',
    secret: true,
    group: 'codex',
  },
  {
    slot: 'CREEM_API_KEY',
    label: 'Creem API Key',
    hint: '测试阶段用 Test Mode 的 key,它只能配 test-api.creem.io',
    secret: true,
    group: null,
  },
  {
    slot: 'CREEM_WEBHOOK_SECRET',
    label: 'Creem Webhook 密钥',
    hint: '验回调签名用。填错会导致充值到不了账',
    secret: true,
    group: null,
  },
] as const

export type SlotName = (typeof SLOTS)[number]['slot']
export const SLOT_NAMES = SLOTS.map((s) => s.slot) as readonly string[]
