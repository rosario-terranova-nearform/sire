import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  requestDeliberationTurn,
  requestPetition,
  requestReactions,
  requestVotes,
} from './calls'
import { getProvider, hasApiKey } from './client'
import { modelChain } from './models'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { resetMetrics } from '@/lib/metrics'
import { SEATED, makeAudience, makeReign } from '@/test/ai-fixtures'

/**
 * The one test file that talks to the real OpenRouter (T-08).
 *
 * Skipped unless there is a key AND `VITE_SIRE_LIVE_AI_TESTS=1`, so
 * `npm run test` stays offline, deterministic and free. Run it with:
 *
 *   npm run test:live
 */
const LIVE = hasApiKey() && import.meta.env.VITE_SIRE_LIVE_AI_TESTS === '1'
const TIMEOUT = 90_000

const reign = makeReign()
const vane = COUNSELORS_BY_ID.vane
const marrow = COUNSELORS_BY_ID.marrow

const petitions = [
  {
    counselorId: 'vane',
    text: 'Open them and march, sire. Nine banners and a dry road close this by harvest.',
    complete: true,
  },
  {
    counselorId: 'marrow',
    text: 'Four thousand bushels, sire, and the salt tax rises a third to replace them.',
    complete: true,
  },
  {
    counselorId: 'hob',
    text: 'Begging pardon, sire, but that grain is my village eating in March.',
    complete: true,
  },
]

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

describe.skipIf(!LIVE)('a live round-trip through OpenRouter (T-08)', () => {
  beforeEach(() => {
    resetMetrics()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it(
    'streams one counselor’s petition in character (T-10)',
    async () => {
      const stream = await requestPetition(vane, makeAudience(), reign)
      const text = await collect(stream.textStream)

      expect(stream.source).toBe('live')
      expect(modelChain('martial')).toContain(stream.modelId)
      expect(text.length).toBeGreaterThan(40)
      // In-world, not a chatbot: no modern register, no self-reference.
      expect(text.toLowerCase()).not.toContain('as an ai')
      expect(text.toLowerCase()).not.toContain('language model')
    },
    TIMEOUT,
  )

  it(
    'falls through transparently when the first chain entry is killed',
    async () => {
      const chain = modelChain('coin')
      const provider = getProvider()
      const fallbacks: string[] = []

      const stream = await requestPetition(marrow, makeAudience(), reign, {
        // Same live provider, but the faction's own model is replaced with a
        // slug that does not exist — the chain must carry the call anyway.
        resolveLanguageModel: (modelId) =>
          provider.chat(
            modelId === chain[0] ? 'sire/no-such-model-exists' : modelId,
          ),
        onFallback: ({ modelId }) => fallbacks.push(modelId),
      })
      const text = await collect(stream.textStream)

      // The faction's own model was tried first and reported as a fallback,
      // and something further down the chain carried the call. Which entry
      // exactly is not asserted: free models rate-limit, so the survivor may
      // be the second free model, `openrouter/free`, or the paid router.
      expect(fallbacks[0]).toBe(chain[0])
      expect(chain.slice(1)).toContain(stream.modelId)
      expect(fallbacks).toEqual(chain.slice(0, chain.indexOf(stream.modelId)))
      expect(text.length).toBeGreaterThan(20)
    },
    TIMEOUT,
  )

  it(
    'takes one adversarial turn that names a rival (T-11)',
    async () => {
      const audience = makeAudience({ stage: 'deliberation', petitions })

      const turn = await requestDeliberationTurn(vane, audience, reign)

      expect(turn.source).toBe('live')
      expect(SEATED).toContain(turn.targetId)
      expect(turn.targetId).not.toBe('vane')
      expect(turn.text.length).toBeGreaterThan(30)
    },
    TIMEOUT,
  )

  it(
    'records a complete, self-vote-free tally (T-12)',
    async () => {
      const audience = makeAudience({ stage: 'vote', petitions })

      const result = await requestVotes(audience, reign)

      expect(result.source).toBe('live')
      expect(result.votes).toHaveLength(SEATED.length)
      for (const vote of result.votes) {
        expect(SEATED).toContain(vote.voterId)
        expect(SEATED).toContain(vote.forId)
        expect(vote.forId).not.toBe(vote.voterId)
      }
    },
    TIMEOUT,
  )

  it(
    'records a reaction per counselor, with deltas in range (T-12)',
    async () => {
      const audience = makeAudience({
        stage: 'aftermath',
        petitions,
        decree: {
          text: 'Open half the granaries. Hold the rest until the thaw is certain.',
          issuedAt: '2026-08-06T09:30:00.000Z',
        },
      })

      const result = await requestReactions(audience, reign)

      expect(result.source).toBe('live')
      expect(result.reactions).toHaveLength(SEATED.length)
      for (const reaction of result.reactions) {
        expect(SEATED).toContain(reaction.counselorId)
        expect(reaction.favorDelta).toBeGreaterThanOrEqual(-2)
        expect(reaction.favorDelta).toBeLessThanOrEqual(2)
      }
    },
    TIMEOUT,
  )
})
