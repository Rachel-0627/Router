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
| **主力渠道** | 泽西同学 **VIP 分组** — Opus 成本 ¥2.20/M,四折下毛利 84.7% |
| **备用渠道** | 泽西同学 **默认分组** — Opus 成本 ¥4.40/M,四折下毛利 69.4% |
| **末档兜底** | **Claude 专属** — 2 倍默认价。2026-09 复查**仍在售**,需重测可用性 |
| **产品定位** | **仅编码 Agent 场景**(Claude Code/Cursor/Cline)。注入无法消除,通用 API 场景不可做 |
| **定价** | **官方 list price × 80%**(八折,两组同价,各自可用环境变量调),充值 $20/$50/$200 |
| **产品分组** | 用户建 key 时选:**Claude**(已上架) / **Codex**(待验证注入行为) |
| **毛利率** | Claude 组 **92.5%** · Codex 组 **97.8%**(主力分组均值) |
| **抗风险** | 降级到最贵兜底档仍有 **69.4%** 毛利;上游涨到 **6.5 倍**才触发涨价评估 |
| **净利率** | ⚠️ `docs/成本与风险.md` 整体待重算(基数混乱 + 支付费率未知) |
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
│   │   │   ├── page.tsx               落地页(八折定位:省心+透明) ✅
│   │   │   ├── pricing/               定价页(逐模型 ours/list 对比) ✅
│   │   │   ├── docs/page.tsx          接入文档(CC/Cursor/SDK 同一页) ✅
│   │   │   │                          内容多了再拆子页,现在没必要
│   │   │   ├── status/                状态页(真实探测+24h可用率) ✅
│   │   │   │                          无数据时诚实说"无数据",
│   │   │   │                          绝不默认显示"一切正常"
│   │   │   └── legal/                 法务页 ×4                  ✅
│   │   │       ├── terms/  privacy/  refund/  aup/
│   │   │
│   │   ├── (auth)/                ── 认证 ── ✅
│   │   │   ├── login/                 登录                      ✅
│   │   │   └── register/              注册                      ✅
│   │   │                              (邮箱验证待定:还没有邮件服务)
│   │   │
│   │   ├── v1/                    ── 网关端点(用户的请求打这里) ── ✅
│   │   │   ├── messages/              Anthropic API(Claude Code) ✅
│   │   │   └── chat/completions/      OpenAI 兼容(Cursor/SDK)    ✅
│   │   │
│   │   ├── (dashboard)/           ── 控制台(登录后) ──
│   │   │   ├── layout.tsx             鉴权唯一入口 + 导航        ✅
│   │   │   └── dashboard/
│   │   │       ├── page.tsx           概览:余额/7日花费/key数    ✅
│   │   │       ├── keys/              API Key 管理(明文只给一次) ✅
│   │   │       ├── usage/             用量看板(柱状/排序条/命中率) ✅
│   │   │       └── billing/           充值 + 交易记录            ✅
│   │   │
│   │   ├── (ops)/                 ── 运营后台(只有你能看) ── ✅
│   │   │   └── ops-2f8a/              总览/模型/定价/用户/密钥    ✅
│   │   │       │                      门禁:账号 role=admin 才进,
│   │   │       │                      授权只能命令行 ops:grant ——
│   │   │       │                      网页提权入口本身就是漏洞温床
│   │   │       ├── groups/            产品分组(自定义,新建=新开产品线) ✅
│   │   │       │                      每条产品线挂到某个上游 + 自己的 key
│   │   │       └── credentials/       密钥配置(加密存库,存完即生效) ✅
│   │   │                              槽位按分组自动生成,
│   │   │                              另含任意 key×任意模型的实测面板
│   │   │
│   │   └── api/                   ── 服务端接口(BFF) ──
│   │       │  (认证/Key/充值都用 Server Action,不走 REST,少一层)
│   │       │   app/actions/auth.ts     注册/登录/登出            ✅
│   │       │   app/actions/keys.ts     Key 增删改禁              ✅
│   │       │   app/actions/billing.ts  发起充值                  ✅
│   │       │   app/actions/ops-secrets.ts 密钥存取/轮换          ✅
│   │       │   app/actions/ops-upstream-test.ts 上游实测(不绑分组) ✅
│   │       │   app/actions/ops-groups.ts  产品分组增删改          ✅
│   │       │   app/actions/ops-upstreams.ts 上游供应商增删改       ✅
│   │       └── webhook/
│   │           └── [provider]/[secret]/  支付回调(路径带密钥+回查校验) ✅
│   │
│   ├── lib/
│   │   ├── upstreams.ts           上游供应商:地址+鉴权方式      ✅
│   │   │                          ⚠️ 鉴权按家配(bearer/x-api-key/raw),
│   │   │                             写死一种就只能接一家
│   │   │                          ⚠️ 不做跨上游自动故障转移 ——
│   │   │                             那要处理重试/计费归属/成本记账
│   │   ├── secrets/               运维密钥:加密存库,保存即生效   ✅
│   │   │   ├── crypto.ts              AES-256-GCM 加解密         ✅
│   │   │   ├── keys.ts                KEK 管理,用指纹而非版本号   ✅
│   │   │   ├── slots.ts               ⚠️ 槽位 = 固定几个 + 每分组一个,
│   │   │   │                              分组加一条这里自动多一个框
│   │   │   └── store.ts               读写+60秒缓存+环境变量兜底  ✅
│   │   │                              ⚠️ KEK 放环境变量,**故意不进库**
│   │   │                                 ——钥匙进库=挂在锁上
│   │   │                              ⚠️ KEK 与 AUTH_SECRET 分家:
│   │   │                                 换登录密钥不该毁掉上游 key
│   │   ├── newapi/                new-api 管理 API 封装(基于实测,非猜测) ✅
│   │   │   ├── client.ts              JWT 登录+缓存/超时/重试     ✅
│   │   │   ├── users.ts               建用户/查余额/加额度        ✅
│   │   │   ├── tokens.ts              建/删/改 key ⚠️key 永远脱敏 ✅
│   │   │   ├── logs.ts                拉用量日志 ⚠️字段待真实流量核对
│   │   │   └── channels.ts            渠道列表/测试/余额刷新     ✅
│   │   ├── gateway/               ⭐ 代理层(A 方案核心)          ✅
│   │   │   ├── proxy.ts               鉴权→余额→限流→转发→计费   ✅
│   │   │   ├── usage.ts               从响应/SSE 提取 token 数    ✅
│   │   │   └── meter.ts               落流水 + 日汇总            ✅
│   │   ├── auth/                  认证                          ✅
│   │   │   ├── password.ts            scrypt 哈希(Node 内置)     ✅
│   │   │   ├── session.ts             jose JWT + HttpOnly cookie ✅
│   │   │   ├── ops.ts                 运营后台独立门禁            ✅
│   │   │   └── dal.ts                 当前用户(鉴权唯一入口)      ✅
│   │   ├── keys.ts                我们自己签发的 key(只存哈希)    ✅
│   │   ├── rate-limit.ts          限流 ⚠️内存版,放量前须换 Redis ✅
│   │   ├── alert.ts               告警(Telegram,自动脱敏密钥)  ✅
│   │   ├── payment/               支付通道(可插拔)
│   │   │   ├── provider.ts            抽象接口 ⭐                ✅
│   │   │   ├── nexapay.ts             NexaPay 实现              ✅
│   │   │   └── index.ts               通道选择                  ✅
│   │   ├── credits.ts             ⭐ 幂等入账(三道防线)        ✅
│   │   ├── db/
│   │   │   ├── schema.ts              5 张表定义                ✅
│   │   │   ├── index.ts               连接(单例池)              ✅
│   │   │   └── queries/
│   │   │       ├── orders.ts          订单查询                  ✅
│   │   │       ├── keys.ts            Key 查询(网关热路径)      ✅
│   │   │       ├── ledger.ts          流水与订单列表            ✅
│   │   │       ├── usage.ts           用量聚合                  ✅
│   │   │       └── ops.ts             运营指标(可支配现金等)     ✅
│   │   ├── pricing/               ⭐ 产品线数量不限,每条独立倍率
│   │   │   ├── types.ts               类型(含长上下文分档)       ✅
│   │   │   ├── groups.ts              产品分组:**查库**,后台可增删改 ✅
│   │   │   │                          代码里的 SEED_GROUPS 只在表
│   │   │   │                          为空时兜底,不是配置入口。
│   │   │   │                          每组带:倍率/上架/协议/密钥槽位
│   │   │   ├── models/claude.ts       5 个 Claude               ✅
│   │   │   ├── models/codex.ts        6 个 GPT(luna 故意不上架) ✅
│   │   │   ├── models/index.ts        汇总                      ✅
│   │   │   └── calculate.ts           按组倍率+按档位(唯一入口)  ✅
│   │   ├── site.ts                站点配置(品牌/域名)          ✅
│   │   ├── auth.ts                认证配置                    [阶段3]
│   │   ├── money.ts               金额换算(micro USD)          ✅
│   │   ├── env.ts                 环境变量校验(启动即校验)      ✅
│   │   ├── errors.ts              统一友好报错                 ✅
│   │   └── logger.ts              日志(自动脱敏密钥)            ✅
│   │
│   ├── ops/                       本地校验脚本(需读 app 代码,故放 web 内)
│   │   ├── check-pricing.ts       价格漂移校验    npm run check:pricing  ✅
│   │   ├── verify-idempotency.ts  幂等入账验证    npm run verify:idem    ✅
│   │   ├── verify-auth.ts         认证逻辑验证    npm run verify:auth    ✅
│   │   ├── verify-newapi.ts       new-api 联调    npm run verify:newapi  ✅
│   │   ├── verify-gateway.ts      网关端到端验证  npm run verify:gateway ✅
│   │   ├── channel-health.ts      渠道探测⭐      npm run ops:health     ✅
│   │   ├── balance-monitor.ts     余额水位告警    npm run ops:balance    ✅
│   │   ├── mock-upstream.mjs      假上游(测代理用) npm run mock:upstream ✅
│   │   └── seed-gateway-fixture.ts 造测试用户和 key                      ✅
│   │
│   └── components/
│       ├── marketing/             ── 已完成 ──
│       │   ├── nav.tsx                导航                      ✅
│       │   ├── footer.tsx             页脚(含合规披露)          ✅
│       │   ├── code-block.tsx         代码块(可复制)            ✅
│       │   ├── straight-answers.tsx   落地页「坦白讲」板块       ✅
│       │   │                          主动披露缺点换信任 ——
│       │   │                          八折下价格优势不足以单独成立
│       │   └── legal-page.tsx         法务页排版                ✅
│       ├── ops/                   运营后台组件
│       │   ├── secret-form.tsx        密钥填写框(只显尾号,不回显明文) ✅
│       │   ├── upstream-test.tsx      上游连通性实测按钮         ✅
│       │   └── kek-panel.tsx          加密密钥状态 + 轮换向导    ✅
│       └── dashboard/             控制台组件
│
└── ops/                           (已并入 web/ops/ —— 这些脚本都要读 app 代码,
                                    单独一套依赖不划算。VPS 上 cron 直接跑
                                    npm run ops:health / ops:balance)
    └── upstream-verify/           ⬜ 仍待写,需上游 key 才能测
        ├── check-cache.ts             缓存真实性验证
        ├── check-injection.ts         prompt 注入痕迹检测
        └── stress-test.ts             并发/限流压测
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
| `lib/gateway/` | ⭐ 用户请求的入口。**new-api 只是渠道路由器**,身份/余额/限流/计费全在这里 |
| `lib/keys.ts` | 我们自己签发 key。明文只在创建时给一次,库里只存 SHA-256 |
| `lib/payment/` | 支付通道抽象,换支付商只改这一层。**webhook 内容一律不信,回查支付商确认** |
| `lib/credits.ts` | **幂等入账**:回查校验 + 行级锁 + 状态幂等,重复回调不会重复加钱 |
| `lib/pricing/` | 售价按**产品分组**倍率 + **长上下文档位**;成本按**上游分组**。三者别混 |
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

### 已完成(本地全部验证通过)

- [x] 上游完整验证 · ⚠️ 2026-08 版,上游已从 4 个分组变成 14 个,待重跑
- [x] 定价设计(四折,进货毛利 84.9%)+ 价格漂移自动校验
- [x] **阶段0 地基** · **阶段1 落地页+法务页**(已部署 globalrouterai.com)
- [x] **阶段2 网关** — 代理层/流式 SSE/故障降级 503。**渠道配置待 VPS**
- [x] **阶段3 认证 + Key 管理** — scrypt/jose 会话/自签发 key
- [x] **阶段4 支付** — 幂等入账/充值页/交易记录。**待 NexaPay 文档**
- [x] **阶段5 用量看板 + 运营后台** `/ops-2f8a`
- [x] **阶段6 Status 页 + 渠道探测 + 余额监控**

### 验证脚本(改完代码跑一遍)

| 命令 | 验什么 |
|---|---|
| `npm run check:pricing` | 上游进货价 + 官方 list 价有没有漂移 |
| `npm run verify:idem` | 并发重复回调只加一次钱 |
| `npm run verify:auth` | 密码哈希 / 会话签名 / 注册约束 |
| `npm run verify:newapi` | 对真实 new-api 实例联调 |
| `npm run verify:gateway` | 网关 12 项(鉴权/降级/流式/计费精度/key 生命周期) |

### ⬜ 还没做 / 被外部条件卡住

| 事项 | 卡在哪 |
|---|---|
| 邮箱验证 + 送 $1 | 没有邮件服务;且**送不送 $1 两份文档打架,待你拍板** |
| Google OAuth | 没有 GOOGLE_CLIENT_ID |
| `ops/upstream-verify/` 三个脚本 | 需要上游 key 才能测注入/缓存 |
| 记录请求实际走的分组 | 需确认 new-api 能否在响应头透出渠道 |
| `logs.ts` 字段核对 | 需要真实流量 |
| 限流换 Redis/Postgres | 内存版在 Vercel 多实例下会被绕过 |

### 🔴 上线前你必须亲自做的

1. **买美西 VPS** + 部署 new-api + 配 3 个渠道
2. **开 Supabase/Neon**,把 `DATABASE_URL` 换掉
3. **new-api 后台确认合规条款** —— 不做的话用户付了钱加不上额度
4. **建服务令牌**填进 `NEWAPI_SERVICE_KEY`(接口拿不到明文,只能手工复制)
5. **拿 NexaPay 文档**,核对 `nexapay.ts` 的 ENDPOINTS / FIELDS
6. **部署修复后的 sonnet-5 价格** —— 线上仍在展示作废的 $3/$15
7. 配 `TELEGRAM_BOT_TOKEN` / `CHAT_ID`,否则告警只进日志

### 本地开发环境

```bash
docker start ai-gw-pg new-api     # Postgres :55432 · new-api :3001
npm run dev                        # :3000
npm run mock:upstream              # 假上游 :3099,测代理用
```
