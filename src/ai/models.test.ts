import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AllModelsFailedError,
  COUNCIL_MODELS,
  FACTION_MODELS,
  FREE_LAST_RESORT,
  PAID_LAST_RESORT,
  isPaidTier,
  modelChain,
  resolveFromChain,
  resolveModel,
} from './models'
import { FACTIONS } from '@/domain/counselor'
import { getMetric, resetMetrics } from '@/lib/metrics'

describe('faction model chains (§6.3)', () => {
  it('maps every faction to a chain', () => {
    for (const faction of FACTIONS) {
      expect(modelChain(faction).length).toBeGreaterThan(0)
    }
  })

  it('ends every chain in the free last resort, then the paid one', () => {
    for (const chain of Object.values(FACTION_MODELS)) {
      expect(chain.at(-2)).toBe(FREE_LAST_RESORT)
      expect(chain.at(-1)).toBe(PAID_LAST_RESORT)
    }
    expect(COUNCIL_MODELS.at(-2)).toBe(FREE_LAST_RESORT)
    expect(COUNCIL_MODELS.at(-1)).toBe(PAID_LAST_RESORT)
  })

  it('starts each chain on a free model, never on the paid router', () => {
    for (const chain of Object.values(FACTION_MODELS)) {
      expect(chain[0]).not.toBe(PAID_LAST_RESORT)
      expect(chain[0].endsWith(':free')).toBe(true)
    }
  })

  it('gives neighbouring factions different first models, for real diversity', () => {
    const firsts = new Set(
      Object.values(FACTION_MODELS).map((chain) => chain[0]),
    )
    expect(firsts.size).toBeGreaterThanOrEqual(3)
  })

  it('treats only openrouter/auto as the paid tier', () => {
    expect(isPaidTier(PAID_LAST_RESORT)).toBe(true)
    expect(isPaidTier(FREE_LAST_RESORT)).toBe(false)
  })
})

describe('walking a chain', () => {
  beforeEach(() => {
    resetMetrics()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns the first success without touching the rest', async () => {
    const attempt = vi.fn(async (modelId: string) => `spoke:${modelId}`)

    const result = await resolveFromChain(['a', 'b', 'c'], attempt)

    expect(result).toMatchObject({
      value: 'spoke:a',
      modelId: 'a',
      attempts: 1,
      paidTier: false,
    })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('falls through to the next entry when one is killed', async () => {
    const fallbacks: string[] = []
    const attempt = vi.fn(async (modelId: string) => {
      if (modelId === 'a') throw new Error('gone')
      return `spoke:${modelId}`
    })

    const result = await resolveFromChain(['a', 'b', 'c'], attempt, {
      onFallback: ({ modelId }) => fallbacks.push(modelId),
    })

    expect(result.modelId).toBe('b')
    expect(result.attempts).toBe(2)
    expect(fallbacks).toEqual(['a'])
    expect(getMetric('model_fallback')).toBe(1)
  })

  it('throws AllModelsFailedError once every entry has failed', async () => {
    const attempt = async () => {
      throw new Error('gone')
    }

    await expect(resolveFromChain(['a', 'b'], attempt)).rejects.toBeInstanceOf(
      AllModelsFailedError,
    )
    expect(getMetric('model_chain_exhausted')).toBe(1)
  })

  it('collects every failure on the way down', async () => {
    const attempt = async (modelId: string) => {
      throw new Error(`${modelId} refused`)
    }

    const error = await resolveFromChain(['a', 'b'], attempt).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(AllModelsFailedError)
    const failures = (error as AllModelsFailedError).failures
    expect(failures.map((failure) => failure.modelId)).toEqual(['a', 'b'])
  })

  it('rethrows immediately when the caller aborts, without burning the chain', async () => {
    const controller = new AbortController()
    const attempt = vi.fn(async () => {
      controller.abort()
      throw new Error('aborted')
    })

    await expect(
      resolveFromChain(['a', 'b', 'c'], attempt, {
        signal: controller.signal,
      }),
    ).rejects.toThrow('aborted')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('resolveModel(faction) walks that faction’s own chain', async () => {
    const seen: string[] = []

    await resolveModel('coin', async (modelId) => {
      seen.push(modelId)
      if (seen.length < 2) throw new Error('gone')
      return 'ok'
    })

    expect(seen).toEqual(modelChain('coin').slice(0, 2))
  })
})
