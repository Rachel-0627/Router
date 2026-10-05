/**
 * 网关代理 —— 用户请求打到这里,校验后转发给 new-api,再把响应流式吐回去。
 *
 * 顺序很重要:
 *   1. 取 key → 2. 查 key 和主人 → 3. 查余额 → 4. 限流 → 5. 转发 → 6. 边流边计费
 *
 * 铁律遵守:
 *   - 上游挂了返回 **503 + Retry-After**,绝不 500(500 会让 Claude Code 直接放弃重试)
 *   - 错误体用 Anthropic 的格式,客户端才能优雅处理
 *   - 不记录 prompt 内容,只记 token 数
 *   - 计费失败不影响用户已拿到的响应
 */
import { env } from '../env'
import { logger } from '../logger'
import { extractKey, hashKey } from '../keys'
import { findActiveKeyByHash, touchKeyUsed } from '../db/queries/keys'
import { getBalanceMicroUsd } from '../credits'
import { checkRate } from '../rate-limit'
import { recordUsage, type MeterContext } from './meter'
import { getModelById } from '../pricing/registry'
import { getGroup, type ProductGroup } from '../pricing/groups'
import type { ProductGroupId } from '../pricing/types'
import { SseUsageCollector, usageFromJson } from './usage'
import { getSecret } from '../secrets/store'

/** 每个 key 每分钟最多多少次请求 */
const RPM_PER_KEY = 120
const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000 // 编码 Agent 的长请求要留足

/** Anthropic 风格的错误体,Claude Code / Cursor 都认这个格式 */
function apiError(status: number, type: string, message: string, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/**
 * 按产品分组选服务令牌。令牌上绑的上游分组决定往哪批渠道路由。
 *
 * 槽位名**存在分组自己身上**(product_group_settings.secret_slot),
 * 不再按分组标识写死 —— 分组是用户在后台自定义的,写死就加不了新产品线。
 *
 * 取值顺序:分组指定的槽位 → 通用令牌。
 * getSecret 内部还带「库里没有就读环境变量」的兜底,所以这里只管挑槽位。
 */
async function serviceKeyFor(group: ProductGroup | undefined): Promise<string | undefined> {
  const slot = group?.secretSlot
  const byGroup = slot ? await getSecret(slot) : undefined
  return byGroup || env.NEWAPI_SERVICE_KEY || undefined
}

/** 这些响应头不能原样透传,由我们自己的运行时决定 */
const STRIP = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection'])

function passthroughHeaders(upstream: Response): Headers {
  const h = new Headers()
  upstream.headers.forEach((v, k) => {
    if (!STRIP.has(k.toLowerCase())) h.set(k, v)
  })
  return h
}

export async function handleProxy(req: Request, upstreamPath: string): Promise<Response> {
  // ── 1. 取 key ──
  const plaintext = extractKey(req.headers)
  if (!plaintext) {
    return apiError(401, 'authentication_error', 'Missing API key. Pass it as x-api-key or Authorization: Bearer.')
  }

  // ── 2. 查 key + 主人 ──
  const found = await findActiveKeyByHash(hashKey(plaintext))
  if (!found) {
    return apiError(401, 'authentication_error', 'Invalid or disabled API key.')
  }
  const { key, user } = found

  // ── 3. 限流 ──
  const gate = await checkRate(`rpm:${key.id}`, RPM_PER_KEY, 60)
  if (!gate.ok) {
    return apiError(429, 'rate_limit_error', 'Too many requests. Slow down and retry.', {
      'Retry-After': '10',
    })
  }

  // ── 4. 余额 ──
  const balance = await getBalanceMicroUsd(user.id)
  if (balance <= 0) {
    return apiError(
      402,
      'invalid_request_error',
      'Your credit balance is empty. Add credits to keep using the API.',
    )
  }

  // ── 5. 读 body,校验模型属于这把 key 的分组 ──
  const rawBody = await req.text()
  let requestedModel = 'unknown'
  try {
    const parsed = JSON.parse(rawBody) as { model?: unknown }
    if (typeof parsed.model === 'string') requestedModel = parsed.model
  } catch {
    return apiError(400, 'invalid_request_error', 'Request body must be valid JSON.')
  }

  // key 上存的就是分组标识,分组名单是用户自定义的,不能再写死映射
  const keyGroup: ProductGroupId = key.productGroup
  const model = await getModelById(requestedModel)
  if (!model) {
    return apiError(404, 'not_found_error', `Unknown model "${requestedModel}".`)
  }
  // key 绑定分组,跨组调用直接拒绝 —— 否则计费倍率会用错
  const [ownGroup, wantGroup] = await Promise.all([getGroup(keyGroup), getGroup(model.group)])
  const ownName = ownGroup?.displayName ?? keyGroup
  if (model.group !== keyGroup) {
    return apiError(
      403,
      'permission_error',
      `This key is for the ${ownName} group and cannot call "${requestedModel}". Create a ${wantGroup?.displayName ?? model.group} key instead.`,
    )
  }
  // 分组是否上架以**数据库**为准(后台可改),不看代码里的默认值
  if (model.groupStatus !== 'live') {
    return apiError(403, 'permission_error', `The ${ownName} group is not available yet.`)
  }

  const [serviceKey, baseUrl] = await Promise.all([
    serviceKeyFor(ownGroup),
    getSecret('NEWAPI_BASE_URL'),
  ])
  if (!baseUrl || !serviceKey) {
    logger.error('网关未配置:缺上游地址或该分组的服务令牌', { group: keyGroup })
    return apiError(503, 'api_error', 'The gateway is not available right now.', { 'Retry-After': '30' })
  }

  const target = `${baseUrl.replace(/\/$/, '')}${upstreamPath}`
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        // 透传 Anthropic 的版本头,不然上游可能拒绝
        ...(req.headers.get('anthropic-version')
          ? { 'anthropic-version': req.headers.get('anthropic-version') as string }
          : {}),
        ...(req.headers.get('anthropic-beta')
          ? { 'anthropic-beta': req.headers.get('anthropic-beta') as string }
          : {}),
      },
      body: rawBody,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (e) {
    // 上游连不上 / 超时 —— 这是日常,不是事故。503 让客户端知道可以重试。
    logger.error('上游请求失败', {
      model: requestedModel,
      detail: e instanceof Error ? e.message : String(e),
    })
    return apiError(503, 'api_error', 'Upstream capacity is temporarily unavailable. Please retry.', {
      'Retry-After': '15',
    })
  }

  void touchKeyUsed(key.id).catch(() => {})
  const ctx: MeterContext = { userId: user.id, keyId: key.id, requestedModel }

  // 上游报错:不计费。但要区分是谁的错。
  if (!upstream.ok) {
    const text = await upstream.text()

    // 5xx = 上游容量问题(号池炸了),这是日常不是事故。
    // 统一转成 503 + Retry-After —— 客户端才会重试;原样透传 502 会让 Claude Code 直接放弃。
    if (upstream.status >= 500) {
      logger.error('上游容量故障,已降级为 503', {
        upstreamStatus: upstream.status,
        model: requestedModel,
      })
      return apiError(
        503,
        'api_error',
        'Upstream capacity is temporarily unavailable. Please retry.',
        { 'Retry-After': '15' },
      )
    }

    // 429 补一个 Retry-After,上游没给的话给个默认值
    if (upstream.status === 429) {
      logger.warn('上游限流', { model: requestedModel })
      const h = passthroughHeaders(upstream)
      if (!h.has('retry-after')) h.set('Retry-After', '10')
      return new Response(text, { status: 429, headers: h })
    }

    // 4xx 是调用方自己的问题(参数错、模型不存在),原样透传才有诊断价值
    logger.warn('上游返回 4xx', { status: upstream.status, model: requestedModel })
    return new Response(text, { status: upstream.status, headers: passthroughHeaders(upstream) })
  }

  const isStream = (upstream.headers.get('content-type') ?? '').includes('text/event-stream')

  // ── 6a. 非流式:读完 → 计费 → 返回 ──
  if (!isStream || !upstream.body) {
    const text = await upstream.text()
    try {
      const { usage, model: actualModel } = usageFromJson(JSON.parse(text))
      await recordUsage(ctx, usage, actualModel)
    } catch {
      logger.error('非流式响应解析用量失败', { model: requestedModel })
    }
    return new Response(text, { status: upstream.status, headers: passthroughHeaders(upstream) })
  }

  // ── 6b. 流式:边转发边累计,流结束时计费 ──
  return new Response(upstream.body.pipeThrough(meteringStream(ctx)), {
    status: upstream.status,
    headers: passthroughHeaders(upstream),
  })
}

/**
 * 透传字节不做任何修改,顺便把 SSE 行喂给用量收集器。
 * flush 时才落账 —— 此时流已结束,函数还活着,Serverless 上不会被提前掐断。
 */
function meteringStream(ctx: MeterContext): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const collector = new SseUsageCollector()
  let buffer = ''

  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk) // 先发给用户,计费不许拖慢流
      try {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // 最后一段可能不完整,留到下次
        for (const line of lines) collector.feedLine(line)
      } catch {
        // 解析出任何问题都不能影响转发
      }
    },
    async flush() {
      if (buffer) collector.feedLine(buffer)
      await recordUsage(ctx, collector.usage, collector.model)
    },
  })
}
