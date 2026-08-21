# PROJECT_MAP · AI Gateway

> 面向英语国家的 AI API 中转站。上游从泽西同学(zexitongxue.com)进货,
> 加价零售给海外开发者,主打 Claude Code / 编码 Agent 场景。
>
> **本文件是项目地图。每次新增或改动文件,必须同步更新这里。**

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/技术方案.md](docs/技术方案.md) | 上游实测数据、技术选型、数据模型、计费定价、风险对冲 |
| [docs/架构设计.md](docs/架构设计.md) | 系统拓扑、三条关键数据流、部署方案、安全边界 |
| [docs/开发计划.md](docs/开发计划.md) | 六个阶段的依赖关系、交付物、验收标准、上线检查清单 |
| [docs/定价设计.md](docs/定价设计.md) | 价格表、缓存定价、赠送策略、抗涨价测算、定价页呈现 |
| [docs/成本与风险.md](docs/成本与风险.md) | 分规模月成本、赔本风险量化、三条保命纪律 |
| [docs/上游验证报告.md](docs/上游验证报告.md) | **实测结果**:号池模式、注入实证、各分组可用性 |

---

## 项目定案(实测确定,不再变更)

| 项目 | 结论 |
|---|---|
| **上游性质** | 号池模式(养 Claude Max 订阅账号轮询),非官方 API |
| **主力渠道** | 泽西同学 **VIP 分组** — 成本 ¥2.20/M,毛利 81.2% |
| **备用渠道** | 泽西同学 **默认分组** — 成本 ¥4.40/M,毛利 62.5% |
| **已废渠道** | Claude 专属(号池已炸)、公司分组(不通) |
| **产品定位** | **仅编码 Agent 场景**(Claude Code/Cursor/Cline)。注入无法消除,通用 API 场景不可做 |
| **定价** | 官方 list price × 30%,充值 $20/$50/$200 |
| **净利率** | **76.3%** · 盈亏平衡月营收 $42 |
| **核心风险** | 号池会周期性被封 → 间歇性故障是日常,**故障转移是核心能力不是附加功能** |

---

## 目录结构

```
ai-gateway/
├── PROJECT_MAP.md                 本文件
├── docs/                          设计文档(见上表)
│
├── web/                           Next.js 前台 + BFF  → Vercel
│   ├── .env.example               环境变量清单               ✅
│   ├── drizzle/                   建表 SQL(自动生成)         ✅
│   ├── app/
│   │   ├── (marketing)/           ── 公开页面 ──
│   │   │   ├── page.tsx               落地页                      ✅
│   │   │   ├── pricing/               定价页(含模型清单)        ✅
│   │   │   ├── docs/                  接入文档(CC/Cursor/SDK)  ✅
│   │   │   │   ├── claude-code/       Claude Code 接入
│   │   │   │   ├── cursor/            Cursor 接入
│   │   │   │   └── sdk/               OpenAI/Anthropic SDK 接入
│   │   │   ├── status/                状态页(阶段6接真实数据)   ✅
│   │   │   └── legal/                 法务页 ×4                  ✅
│   │   │       ├── terms/  privacy/  refund/  aup/
│   │   │
│   │   ├── (auth)/                ── 认证 ──
│   │   │   ├── login/  register/  verify/
│   │   │
│   │   ├── (dashboard)/           ── 控制台(登录后) ──
│   │   │   ├── page.tsx               概览:余额+近期用量
│   │   │   ├── keys/                  API Key 管理
│   │   │   ├── usage/                 用量看板
│   │   │   └── billing/               充值 + 交易记录
│   │   │
│   │   ├── (ops)/                 ── 运营后台(只有你能看) ──
│   │   │   └── ops-2f8a/              资金安全/备货/经营/风险/用户
│   │   │
│   │   └── api/                   ── 服务端接口(BFF) ──
│   │       ├── auth/                  认证回调
│   │       ├── keys/                  Key 增删改查
│   │       ├── usage/                 用量数据
│   │       ├── checkout/              发起支付
│   │       └── webhook/
│   │           └── [provider]/[secret]/  支付回调(路径带密钥+回查校验) ✅
│   │
│   ├── lib/
│   │   ├── newapi/                new-api 管理 API 封装
│   │   │   ├── client.ts              HTTP 客户端(超时/重试)
│   │   │   ├── users.ts               建用户/查余额/加额度
│   │   │   ├── tokens.ts              建 key/删 key/改限额
│   │   │   └── logs.ts                拉用量日志
│   │   ├── payment/               支付通道(可插拔)
│   │   │   ├── provider.ts            抽象接口 ⭐                ✅
│   │   │   ├── nexapay.ts             NexaPay 实现              ✅
│   │   │   └── index.ts               通道选择                  ✅
│   │   ├── credits.ts             ⭐ 幂等入账(三道防线)        ✅
│   │   ├── db/
│   │   │   ├── schema.ts              5 张表定义                ✅
│   │   │   ├── index.ts               连接(单例池)              ✅
│   │   │   └── queries/orders.ts      订单查询                  ✅
│   │   ├── pricing/
│   │   │   ├── models.ts              5个模型 list价+VIP成本    ✅
│   │   │   └── calculate.ts           售价/毛利计算(唯一入口)   ✅
│   │   ├── site.ts                站点配置(品牌/域名)          ✅
│   │   ├── auth.ts                认证配置                    [阶段3]
│   │   ├── money.ts               金额换算(micro USD)          ✅
│   │   ├── env.ts                 环境变量校验(启动即校验)      ✅
│   │   ├── errors.ts              统一友好报错                 ✅
│   │   └── logger.ts              日志(自动脱敏密钥)            ✅
│   │
│   └── components/
│       ├── marketing/             ── 已完成 ──
│       │   ├── nav.tsx                导航                      ✅
│       │   ├── footer.tsx             页脚(含合规披露)          ✅
│       │   ├── code-block.tsx         代码块(可复制)            ✅
│       │   └── legal-page.tsx         法务页排版                ✅
│       └── dashboard/             控制台组件
│
└── ops/                           运维脚本  → VPS cron
    ├── channel-health/           渠道健康监控 ⭐核心
    │   ├── probe.ts                   每5分钟探测全部分组
    │   └── failover.ts                状态变化 → 告警 + 切渠道
    ├── upstream-verify/           上游验证(每周重跑)
    │   ├── check-cache.ts             缓存真实性验证
    │   ├── check-injection.ts         prompt 注入痕迹检测
    │   └── stress-test.ts             并发/限流压测
    └── balance-monitor/           余额监控
        ├── monitor.ts                 查余额 + 算消耗速度 + 判水位
        └── alert.ts                   三级告警(Telegram/邮件/推送)
```

**另有 new-api(Docker)部署在美西 VPS,不在本仓库内,只做配置管理。**

---

## 模块职责速查

| 模块 | 一句话职责 |
|---|---|
| `app/(marketing)/` | 让访客理解产品并注册;通过 MoR 审核 |
| `app/(auth)/` | 用户身份(邮箱/OAuth),不依赖 new-api |
| `app/(dashboard)/` | 用户自助:看余额、管 key、查用量、充值 |
| `app/(ops)/` | **你的运营后台**:可支配现金/备货天数/毛利/拒付。独立密钥保护 |
| `app/api/webhook/` | 收款回调 → 幂等入账 → 调 new-api 加额度 |
| `lib/newapi/` | **唯一**与 new-api 通信的地方,别处不直接调 |
| `lib/payment/` | 支付通道抽象,换支付商只改这一层。**webhook 内容一律不信,回查支付商确认** |
| `lib/credits.ts` | **幂等入账**:回查校验 + 行级锁 + 状态幂等,重复回调不会重复加钱 |
| `lib/pricing/` | 成本与售价的唯一计算来源 |
| `ops/balance-monitor/` | 防止上游余额耗尽导致全站宕机 |
| `ops/upstream-verify/` | 每周验证上游没有变质(注入/缓存/价格) |
| `ops/channel-health/` | **每5分钟探测全部分组**,号池炸了立刻告警并切渠道 |

---

## 铁律(每次改动都要遵守)

1. **单文件不超过 200 行**,超了就拆
2. **密钥走环境变量**,`.env` 必须在 `.gitignore`
3. **支付 Webhook 必须幂等** —— 靠 `orders.external_id` 唯一索引
4. **`credit_ledger` 只加不改** —— 余额 = 流水求和,不存余额字段
5. **每 key 日额度 + RPM 限流**必须开,防刷防跑费
6. **不存 prompt 内容**,只记 token 数(GDPR 友好 + 是卖点)
7. **报错对用户友好**,原始堆栈和上游信息只进日志
8. **只有 `lib/newapi/` 能调 new-api**,其他模块不许绕过

---

## 当前进度

- [x] 上游完整验证(协议/缓存/注入/分组/号池)
- [x] 支付方案(Creem + Paddle + Payoneer)
- [x] 定价设计(VIP 成本,官方3折,净利 76.3%)
- [x] 架构与开发计划 v2
- [x] **阶段0 地基** — 骨架/5张表/环境校验/报错/日志脱敏
- [x] **阶段1 落地页 + 法务页** — 8个页面全部构建通过
- [ ] **← 现在这里** 提交 Creem/Paddle 申请 → 同时开阶段2
- [ ] 阶段2 网关 + 故障转移(2天)⬆️ 已提前
- [ ] 阶段3 认证 + Key 管理(2天)
- [ ] 阶段4 支付充值(2天)
- [ ] 阶段5 用量看板 + 运营后台(2.5天)
- [ ] 阶段6 Status 页 + 打磨(1天)

**开发净工时 11.5 天 · 日历 3-4 周(卡在 MoR 审核)**
