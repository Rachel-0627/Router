/**
 * 模型总表。按产品线拆文件,这里只做汇总 —— 单文件不超 200 行。
 */
import type { ModelSeed } from '../types'
import { CLAUDE_MODELS } from './claude'
import { CODEX_MODELS } from './codex'

/**
 * ⚠️ 这只是**初始种子数据**,不是运行时的模型来源。
 *    运行时一律走 lib/pricing/registry.ts(从数据库读,后台可增删改)。
 *    这里保留是为了 `npm run seed:models` 能把初始清单灌进库。
 */
export const SEED_MODELS: ModelSeed[] = [...CLAUDE_MODELS, ...CODEX_MODELS]

export * from '../types'
