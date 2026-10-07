/**
 * 站点配置 —— 品牌名/域名等占位值集中在这里。
 * 想好真实品牌和域名后,只改这个文件,全站生效。
 */
export const site = {
  name: 'GlobalRouter',
  // ⚠️ 不要在这里写死折扣百分比 —— 倍率是按分组配置的,写死会和实际价格对不上,
  //    那是虚假宣传。要显示折扣就调 savingsPct(groupId) 动态算。
  tagline: 'Run your coding agent for less',
  description:
    'A drop-in API gateway for Claude Code, Cursor, and Cline. Prepaid credits, full prompt caching support, and billing below list price.',

  domain: 'globalrouterai.com',
  url: 'https://globalrouterai.com',
  // ⚠️ 用主域,不要写 api. 子域 —— 那个子域没有 DNS 记录,
  //    用户照着首页复制会直接撞 DNS 解析失败(看起来像"这站是假的")。
  //    网关路由 /v1/messages 和 /v1/chat/completions 就挂在主站上。
  //    将来真要拆独立子域:先在 DNS 加 CNAME + Vercel 项目里登记,通了再改这里。
  apiBaseUrl: 'https://globalrouterai.com',

  supportEmail: 'support@globalrouterai.com',
  legalEntity: 'GlobalRouter',           // 主体注册后替换成公司名

  nav: [
    { label: 'Pricing', href: '/pricing' },
    { label: 'Docs', href: '/docs' },
    { label: 'Status', href: '/status' },
  ],
  legalNav: [
    { label: 'Terms', href: '/legal/terms' },
    { label: 'Privacy', href: '/legal/privacy' },
    { label: 'Refunds', href: '/legal/refund' },
    { label: 'Acceptable Use', href: '/legal/aup' },
  ],

  /** 合规披露 —— 必须出现在定价页和文档页 */
  disclosure:
    'GlobalRouter is an independent third-party API gateway. We are not affiliated with, ' +
    'endorsed by, or sponsored by Anthropic. Requests are routed through upstream ' +
    'providers, and model behavior — including system-level instructions and how the ' +
    'model describes itself — can differ from a first-party API. The service is built ' +
    'and tuned for coding agent workloads; evaluate it for your use case before relying on it.',

  /**
   * 充值档位。默认选中 $50 ——
   * 加密货币**做不到自动续费**(没法从用户钱包拉钱),每次付款都有摩擦,
   * 所以要让用户少付几次、一次充够,而不是频繁小额。
   */
  topupTiers: [
    { amount: 20, label: '$20' },
    { amount: 50, label: '$50', popular: true },
    { amount: 200, label: '$200' },
  ],
  /**
   * 最低充值 $20。
   *
   * ⚠️ 这个数一度被我改成 $5,理由是"加密货币手续费只有 1%,$20 的门槛是
   *    信用卡逼出来的"。推理没错,但**漏了上游自己的下限**:实测
   *    NOWPayments 对 USD→USDT-TRC20 的最低额是 **18.55 USD**(链上手续费
   *    撑不住更小的额度)。拿同行 AiHubMix ¥1 起充做对比也不成立 ——
   *    人家走支付宝,不是链上转账。
   *
   *    更要命的是:低于下限的单**能建出来**,用户真去付时才被拒 ——
   *    失败点在最后一步,体验最差。所以必须留足缓冲。
   *
   *    ⚠️ 上游这个下限会随链上手续费浮动,别贴着 18.55 设。
   *       后台「支付通道自检」第③项会实时核对,调价前先跑一次。
   */
  minTopupUsd: 20,
} as const
