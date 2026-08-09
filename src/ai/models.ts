import type { Faction } from '@/domain/counselor'
import { countMetric } from '@/lib/metrics'
import {
  FreeTierExhaustedError,
  isAccountQuotaError,
  isRateLimitError,
  quotaResetAt,
  retryAfterMs,
} from './rate-limit'

/**
 * Model routing (§6.3). Faction → an ordered fallback chain, so disagreement
 * is partly architectural rather than purely prompted: the Marshal and the
 * Keeper are arguing on different weights, not the same model in two hats.
 *
 * The three free slots below were picked from the live OpenRouter free list at
 * implementation time (2026-08-07) — three different vendors, all confirmed to
 * answer in character and to support structured output. Free availability
 * rotates, so **no single model is load-bearing**: every chain runs two named
 * free models, then `openrouter/free`, then `openrouter/auto` as a paid last
 * resort, then demo mode (§7.1) if even that fails.
 */

/** Google weights. */
export const FREE_MODEL_A = 'google/gemma-4-26b-a4b-it:free'
/** NVIDIA weights. */
export const FREE_MODEL_B = 'nvidia/nemotron-3-super-120b-a12b:free'
/** Poolside weights. */
export const FREE_MODEL_C = 'poolside/laguna-s-2.1:free'

/** The last *free* resort in every chain. */
export const FREE_LAST_RESORT = 'openrouter/free'

/**
 * OpenRouter's Auto Router. No deterministic per-faction mapping and it bills
 * at whichever model it picks, so it sits one tier below every free option.
 */
export const PAID_LAST_RESORT = 'openrouter/auto'

/**
 * Two named free tiers per faction before `openrouter/free`, not one.
 *
 * Free models are rate-limited per account, and one audience is 11+ calls in a
 * burst — during T-08 verification a full session ran the first entry into a
 * 429 and reached the *paid* router on three turns. A second free vendor keeps
 * "normal operation is free-tier only" (§7.1) true in practice, not just on
 * paper. The first entry still decides the faction's voice.
 */
export const FACTION_MODELS: Record<Faction, readonly string[]> = {
  martial: [FREE_MODEL_A, FREE_MODEL_B, FREE_LAST_RESORT, PAID_LAST_RESORT],
  coin: [FREE_MODEL_B, FREE_MODEL_C, FREE_LAST_RESORT, PAID_LAST_RESORT],
  fool: [FREE_MODEL_C, FREE_MODEL_A, FREE_LAST_RESORT, PAID_LAST_RESORT],
  temple: [FREE_MODEL_A, FREE_MODEL_C, FREE_LAST_RESORT, PAID_LAST_RESORT],
  whispers: [FREE_MODEL_B, FREE_MODEL_A, FREE_LAST_RESORT, PAID_LAST_RESORT],
  commons: [FREE_MODEL_C, FREE_MODEL_B, FREE_LAST_RESORT, PAID_LAST_RESORT],
}

/**
 * The chain for council-wide structured calls (§5.5, §5.7). These belong to no
 * faction — they are the clerk recording the room — so they get their own
 * chain, ordered by structured-output support rather than by voice.
 */
export const COUNCIL_MODELS: readonly string[] = [
  FREE_MODEL_B,
  FREE_MODEL_A,
  FREE_LAST_RESORT,
  PAID_LAST_RESORT,
]

export function modelChain(faction: Faction): readonly string[] {
  return FACTION_MODELS[faction]
}

/** True for the one tier that can cost real money (§7.1). */
export function isPaidTier(modelId: string): boolean {
  return modelId === PAID_LAST_RESORT
}

export interface ModelFailure {
  modelId: string
  error: unknown
}

export interface FallbackInfo extends ModelFailure {
  /** How many entries are left in the chain after this one. */
  remaining: number
}

export interface ChainResult<T> {
  value: T
  /** The slug that actually answered. */
  modelId: string
  paidTier: boolean
  /** 1 on a first-try success. */
  attempts: number
}

export class AllModelsFailedError extends Error {
  readonly kind = 'all-models-failed'

  readonly chain: readonly string[]
  readonly failures: readonly ModelFailure[]

  constructor(chain: readonly string[], failures: readonly ModelFailure[]) {
    super(`Every model in the chain failed: ${chain.join(' → ')}`)
    this.name = 'AllModelsFailedError'
    this.chain = chain
    this.failures = failures
  }
}

export interface ChainOptions {
  signal?: AbortSignal
  onFallback?: (info: FallbackInfo) => void
}

/** How long to wait out a per-model 429 before trying that model once more. */
export const RATE_LIMIT_PAUSE_MS = 1_200
export const MAX_RATE_LIMIT_PAUSE_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Walk a chain, returning the first model that succeeds.
 *
 * Two failures are special:
 *  - An aborted signal is rethrown at once. A cancelled audience must not burn
 *    through four models on its way out.
 *  - An account-wide free-quota 429 aborts the walk entirely: every remaining
 *    free entry is on the same key and would fail the same way, and the only
 *    thing past them costs money. That surfaces as `FreeTierExhaustedError`,
 *    which the call layer turns into demo mode (§7.1).
 *
 * A per-model 429 gets one patient retry on the same model before moving on.
 */
export async function resolveFromChain<T>(
  chain: readonly string[],
  attempt: (modelId: string) => Promise<T>,
  { signal, onFallback }: ChainOptions = {},
): Promise<ChainResult<T>> {
  const failures: ModelFailure[] = []
  let calls = 0

  for (const [index, modelId] of chain.entries()) {
    for (let tries = 0; tries < 2; tries += 1) {
      signal?.throwIfAborted()
      calls += 1

      try {
        const value = await attempt(modelId)
        return {
          value,
          modelId,
          paidTier: isPaidTier(modelId),
          attempts: calls,
        }
      } catch (error) {
        if (signal?.aborted) throw error

        // Already diagnosed as a spent key, either by this call or by an
        // earlier one. Walking on would burn the rest of the chain and end at
        // the paid router for a reason that has nothing to do with models.
        if (error instanceof FreeTierExhaustedError) throw error

        if (isAccountQuotaError(error)) {
          countMetric('free_quota_exhausted', { modelId })
          throw new FreeTierExhaustedError(
            'The free-model quota for this key is spent.',
            quotaResetAt(error),
          )
        }

        const patient = tries === 0 && isRateLimitError(error)
        if (patient) {
          const wait = Math.min(
            retryAfterMs(error, Date.now()) ?? RATE_LIMIT_PAUSE_MS,
            MAX_RATE_LIMIT_PAUSE_MS,
          )
          countMetric('rate_limited', { modelId, waitMs: wait })
          await sleep(wait)
          continue
        }

        failures.push({ modelId, error })
        countMetric('model_fallback', { modelId })
        onFallback?.({ modelId, error, remaining: chain.length - index - 1 })
        break
      }
    }
  }

  countMetric('model_chain_exhausted', { chain: chain.join(' → ') })
  throw new AllModelsFailedError(chain, failures)
}

/** §6.3's `resolveModel(faction)`: the faction's chain, walked on failure. */
export function resolveModel<T>(
  faction: Faction,
  attempt: (modelId: string) => Promise<T>,
  options?: ChainOptions,
): Promise<ChainResult<T>> {
  return resolveFromChain(modelChain(faction), attempt, options)
}
