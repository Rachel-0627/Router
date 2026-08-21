/**
 * 站点配置 —— 品牌名/域名等占位值集中在这里。
 * 想好真实品牌和域名后,只改这个文件,全站生效。
 */
export const site = {
  name: 'GlobalRouter',
  tagline: 'Run your coding agent for 60% less',
  description:
    'A drop-in API gateway for Claude Code, Cursor, and Cline. Prepaid credits, full prompt caching support, and bills around 60% below list price.',

  domain: 'globalrouterai.com',
  url: 'https://globalrouterai.com',
  apiBaseUrl: 'https://api.globalrouterai.com',

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

  topupTiers: [
    { amount: 20, label: '$20' },
    { amount: 50, label: '$50', popular: true },
    { amount: 200, label: '$200' },
  ],
  minTopupUsd: 20,
} as const
