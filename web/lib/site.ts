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
   * ⚠️ 这个数**不是拍脑袋定的,是上游的硬下限**。实测 NOWPayments 对
   *    USD→USDT-TRC20 的最低额是 $18.54,而且和开关无关 ——
   *    锁汇率/不锁汇率、网络费谁出,四种组合全是 18.54。
   *    (曾试过关掉 is_fixed_rate 来压低它,证伪了。)
   *    设 $20 留了 8% 缓冲:链上手续费会浮动,贴着下限设,
   *    上游一涨就有用户付不了款。
   *
   * ⚠️ 真正决定这个数的其实是**用户自己的转账费**,不是我们收的 1%:
   *    TRC20 提币费约 1 USDT 且**固定**,所以
   *      $5 档它占 20%(用户花 $6 买 $5)·  $20 档占 5% ·  $50 档占 2%
   *    小额对用户是很糟的买卖,即使上游允许也不该主推。
   *
   *    换成卡通道时这个约束会变,届时用后台「支付通道自检」第③项复核。
   */
  minTopupUsd: 20,
} as const
