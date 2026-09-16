/**
 * 计费入账 —— 请求跑完后把用量变成钱,写进流水和日汇总。
 *
 * ⚠️ 已知缺口:目前**不知道这次请求实际走了哪个上游分组**,一律按主力分组(VIP)算成本。
 *    降级到默认分组时真实成本翻倍,这里会低估。
 *    要修:new-api 需要在响应头里透出渠道信息(待确认它支不支持),
 *    拿到后把 group 传进 requestCostUsd()。见 lib/pricing/calculate.ts 的 worstCaseMarginPct。
 */
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { creditLedger, usageDaily } from '../db/schema'
import { getModelById } from '../pricing/registry'
import { requestCostUsd, primaryGroup } from '../pricing/calculate'
import { logger } from '../logger'
import type { TokenUsage } from './usage'

const toMicro = (usd: number) => Math.round(usd * 1_000_000)

export type MeterContext = {
  userId: string
  keyId: string
  requestedModel: string
}

/**
 * 记一次请求的账。
 * **不抛错** —— 计费失败绝不能影响已经返回给用户的响应,只记日志告警。
 */
export async function recordUsage(ctx: MeterContext, usage: TokenUsage, actualModel?: string) {
  const modelId = actualModel ?? ctx.requestedModel
  const model = (await getModelById(modelId)) ?? (await getModelById(ctx.requestedModel))

  if (!model) {
    // 卖了一个不在价目表里的模型 —— 收不上钱,必须告警
    logger.error('计费失败:模型不在价目表', { modelId, userId: ctx.userId })
    return
  }
  if (usage.input + usage.output + usage.cacheRead + usage.cacheWrite === 0) {
    logger.warn('用量为 0,跳过计费', { modelId, userId: ctx.userId })
    return
  }

  // ⚠️ 仍然不知道这次请求实际走了哪个上游分组,只能按该模型的主力分组估。
  //    降级期间真实成本会更高,这里会低估 —— 待 new-api 能透出渠道信息后传真实值。
  const { revenue, cost } = requestCostUsd(
    model,
    { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite },
    primaryGroup(model) ?? undefined,
  )
  const revenueMicro = toMicro(revenue)
  const costMicro = cost != null ? toMicro(cost) : 0

  try {
    await db.transaction(async (tx) => {
      // 扣费:流水只追加,余额 = 求和
      await tx.insert(creditLedger).values({
        userId: ctx.userId,
        deltaMicroUsd: -revenueMicro,
        type: 'usage',
        refType: 'api_key',
        refId: ctx.keyId,
        note: modelId,
      })

      // 日汇总:同一天同一模型累加
      const day = new Date().toISOString().slice(0, 10)
      await tx
        .insert(usageDaily)
        .values({
          userId: ctx.userId,
          day,
          model: modelId,
          requests: 1,
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheReadTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite,
          costMicroUsd: costMicro,
          revenueMicroUsd: revenueMicro,
        })
        .onConflictDoUpdate({
          target: [usageDaily.userId, usageDaily.day, usageDaily.model],
          set: {
            requests: sql`${usageDaily.requests} + 1`,
            inputTokens: sql`${usageDaily.inputTokens} + ${usage.input}`,
            outputTokens: sql`${usageDaily.outputTokens} + ${usage.output}`,
            cacheReadTokens: sql`${usageDaily.cacheReadTokens} + ${usage.cacheRead}`,
            cacheWriteTokens: sql`${usageDaily.cacheWriteTokens} + ${usage.cacheWrite}`,
            costMicroUsd: sql`${usageDaily.costMicroUsd} + ${costMicro}`,
            revenueMicroUsd: sql`${usageDaily.revenueMicroUsd} + ${revenueMicro}`,
          },
        })
    })
  } catch (e) {
    // 这是「用户用了但没扣到钱」,是会赔钱的,必须能被监控抓到
    logger.error('计费写库失败(用户已获得服务但未扣费)', {
      userId: ctx.userId,
      modelId,
      revenueMicro,
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
