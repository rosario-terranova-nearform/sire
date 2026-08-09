import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELIBERATION_MAX_TOKENS,
  DEMO_MAX_CHUNKS,
  DEMO_MODEL_ID,
  chunkRecording,
  NotSeatedError,
  PETITION_MAX_TOKENS,
  UnknownCounselorError,
  requestDeliberationTurn,
  requestPetition,
  requestReactions,
  requestVotes,
} from './calls'
import { getDemoState, resetDemoMode } from './demo-mode'
import {
  COUNCIL_MODELS,
  FACTION_MODELS,
  FREE_LAST_RESORT,
  modelChain,
} from './models'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { demoPetition, demoVote } from '@/content/demo-audience'
import { getMetric, resetMetrics } from '@/lib/metrics'
import { MAX_IN_FLIGHT } from './throttle'
import {
  SEATED,
  makeAudience,
  makeReign,
  mockDeadModel,
  mockObjectModel,
  mockQuotaExhaustedModel,
  mockRateLimitedOnceModel,
  mockSequenceModel,
  mockSilentModel,
  mockTextModel,
  mockTruncatedModel,
  resolverFor,
} from '@/test/ai-fixtures'

const reign = makeReign()
const vane = COUNSELORS_BY_ID.vane
const marrow = COUNSELORS_BY_ID.marrow
const hob = COUNSELORS_BY_ID.hob
const wren = COUNSELORS_BY_ID.wren

const petitions = [
  { counselorId: 'vane', text: 'March, sire.', complete: true },
  {
    counselorId: 'marrow',
    text: 'Four thousand crowns, sire.',
    complete: true,
  },
  {
    counselorId: 'hob',
    text: 'It is my boy carries that spear.',
    complete: true,
  },
]

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

beforeEach(() => {
  resetMetrics()
  resetDemoMode()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('requestPetition (§5.3, T-10)', () => {
  it('streams one counselor’s speech, in character', async () => {
    const spoken = 'Strike in spring, sire. Nine banners and the matter closes.'
    const model = mockTextModel(modelChain('martial')[0], spoken, [
      'Strike in spring, sire. ',
      'Nine banners and the matter closes.',
    ])

    const stream = await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
    })

    expect(stream.source).toBe('live')
    expect(stream.modelId).toBe(FACTION_MODELS.martial[0])
    expect(await collect(stream.textStream)).toBe(spoken)
  })

  it('caps the output tokens behind the 2-to-4-sentence rule', async () => {
    const model = mockTextModel(modelChain('martial')[0], 'March, sire.')

    const stream = await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
    })
    await collect(stream.textStream)

    expect(model.doStreamCalls[0].maxOutputTokens).toBe(PETITION_MAX_TOKENS)
  })

  it('throws on an unknown counselor before any network call', async () => {
    const model = mockTextModel(modelChain('martial')[0], 'never spoken')
    const stranger = { ...vane, id: 'nobody' }

    await expect(
      requestPetition(stranger, makeAudience(), reign, {
        resolveLanguageModel: resolverFor({ [model.modelId]: model }),
      }),
    ).rejects.toBeInstanceOf(UnknownCounselorError)
    expect(model.doStreamCalls).toHaveLength(0)
  })

  it('throws when the counselor is real but not at this table', async () => {
    const model = mockTextModel(modelChain('whispers')[0], 'never spoken')

    await expect(
      requestPetition(wren, makeAudience(), reign, {
        resolveLanguageModel: resolverFor({ [model.modelId]: model }),
      }),
    ).rejects.toBeInstanceOf(NotSeatedError)
    expect(model.doStreamCalls).toHaveLength(0)
  })

  it('falls through the whole chain to the first model that answers (T-08)', async () => {
    const chain = modelChain('coin')
    const survivor = mockTextModel(
      FREE_LAST_RESORT,
      'The ledger says no, sire.',
    )
    const fallbacks: string[] = []

    const stream = await requestPetition(marrow, makeAudience(), reign, {
      // Only the free last resort is mapped; every named model above it is dead.
      resolveLanguageModel: resolverFor({ [FREE_LAST_RESORT]: survivor }),
      onFallback: ({ modelId }) => fallbacks.push(modelId),
    })

    expect(stream.modelId).toBe(FREE_LAST_RESORT)
    // Every entry ahead of the survivor was tried, in order, and reported.
    expect(fallbacks).toEqual(chain.slice(0, chain.indexOf(FREE_LAST_RESORT)))
    expect(fallbacks[0]).toBe(FACTION_MODELS.coin[0])
    expect(await collect(stream.textStream)).toBe('The ledger says no, sire.')
  })

  it('treats a model that says nothing as a failed model', async () => {
    const silent = mockSilentModel(modelChain('coin')[0])
    const survivor = mockTextModel(FREE_LAST_RESORT, 'Four thousand, sire.')

    const stream = await requestPetition(marrow, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({
        [silent.modelId]: silent,
        [survivor.modelId]: survivor,
      }),
    })

    expect(stream.modelId).toBe(FREE_LAST_RESORT)
  })

  it('returns the recording once every entry in the chain has failed', async () => {
    const stream = await requestPetition(hob, makeAudience(), reign, {
      resolveLanguageModel: (modelId) => mockDeadModel(modelId),
      demoChunkDelayMs: 0,
    })

    expect(stream.source).toBe('demo')
    expect(stream.modelId).toBe(DEMO_MODEL_ID)
    expect(await collect(stream.textStream)).toBe(demoPetition('hob'))
    expect(getDemoState()).toEqual({
      active: true,
      reason: 'all-models-failed',
    })
  })

  it('keeps a half-spoken petition when the stream dies mid-sentence', async () => {
    const model = mockTruncatedModel(
      modelChain('commons')[0],
      'Begging pardon, ',
    )
    const errors: unknown[] = []

    const stream = await requestPetition(hob, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
      onStreamError: (error) => errors.push(error),
    })

    expect(await collect(stream.textStream)).toBe('Begging pardon, ')
    expect(errors).toHaveLength(1)
    expect(getMetric('stream_error')).toBe(1)
  })

  it('asks each model exactly once, leaving retries to the chain', async () => {
    // The SDK's own retry policy would fire three requests per dead model and
    // triple the burn against a per-day quota. We own the retries.
    const dead = mockDeadModel(modelChain('martial')[0])

    await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({ [dead.modelId]: dead }),
      demoChunkDelayMs: 0,
    })

    expect(dead.doStreamCalls).toHaveLength(1)
  })

  it('waits out a per-model 429 and tries that model again', async () => {
    const flaky = mockRateLimitedOnceModel(
      modelChain('martial')[0],
      'Strike in spring, sire.',
    )
    const fallbacks: string[] = []

    const stream = await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({ [flaky.modelId]: flaky }),
      onFallback: ({ modelId }) => fallbacks.push(modelId),
    })

    expect(stream.source).toBe('live')
    expect(stream.modelId).toBe(modelChain('martial')[0])
    // It never gave up on the model, so nothing fell through.
    expect(fallbacks).toEqual([])
    expect(flaky.doStreamCalls).toHaveLength(2)
    expect(getMetric('rate_limited')).toBe(1)
  })

  it('stops at the first key-wide quota 429 instead of walking the chain (§7.1)', async () => {
    const chain = modelChain('martial')
    const spent = chain.map((modelId) => mockQuotaExhaustedModel(modelId))
    const fallbacks: string[] = []

    const stream = await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolverFor(
        Object.fromEntries(spent.map((model) => [model.modelId, model])),
      ),
      onFallback: ({ modelId }) => fallbacks.push(modelId),
      demoChunkDelayMs: 0,
    })

    expect(stream.source).toBe('demo')
    expect(await collect(stream.textStream)).toBe(demoPetition('vane'))
    // Only the first model was asked: the rest are on the same spent key.
    expect(spent[0].doStreamCalls).toHaveLength(1)
    for (const model of spent.slice(1)) {
      expect(model.doStreamCalls).toHaveLength(0)
    }
    expect(fallbacks).toEqual([])
    expect(getMetric('free_quota_exhausted')).toBe(1)
  })

  it('never reaches the paid router because a free quota ran out', async () => {
    const chain = modelChain('coin')
    const paid = mockTextModel(chain[chain.length - 1], 'Billed counsel, sire.')
    const spent = mockQuotaExhaustedModel(chain[0])

    const stream = await requestPetition(marrow, makeAudience(), reign, {
      resolveLanguageModel: resolverFor({
        [spent.modelId]: spent,
        [paid.modelId]: paid,
      }),
      demoChunkDelayMs: 0,
    })

    expect(stream.source).toBe('demo')
    expect(paid.doStreamCalls).toHaveLength(0)
    expect(getDemoState().reason).toBe('free-quota-spent')
  })

  it('stops dialling out for the rest of the session once the key is spent', async () => {
    const spent = mockQuotaExhaustedModel(modelChain('martial')[0])
    const resolve = resolverFor({ [spent.modelId]: spent })

    await requestPetition(vane, makeAudience(), reign, {
      resolveLanguageModel: resolve,
      demoChunkDelayMs: 0,
    })
    const second = await requestPetition(marrow, makeAudience(), reign, {
      resolveLanguageModel: resolve,
      demoChunkDelayMs: 0,
    })

    expect(second.source).toBe('demo')
    // One request in the whole session, not one per counselor.
    expect(spent.doStreamCalls).toHaveLength(1)
  })

  it('never sends a hard reasoning disable to openrouter/free', async () => {
    // That endpoint answers 400 "Reasoning is mandatory", which would knock the
    // last free tier out of every chain.
    const free = mockTextModel(FREE_LAST_RESORT, 'The ledger says no, sire.')
    const named = mockTextModel(
      modelChain('coin')[0],
      'Four thousand crowns, sire.',
    )

    for (const model of [named, free]) {
      resetDemoMode()
      const stream = await requestPetition(marrow, makeAudience(), reign, {
        resolveLanguageModel: resolverFor({ [model.modelId]: model }),
      })
      await collect(stream.textStream)
    }

    const reasoningFor = (model: typeof free) =>
      model.doStreamCalls[0].providerOptions?.openrouter?.reasoning

    expect(reasoningFor(named)).toEqual({ enabled: false })
    expect(reasoningFor(free)).toEqual({ exclude: true })
  })

  it('spares the rest of the council once one petition finds the key spent', async () => {
    const chain = modelChain('martial')
    const spent = mockQuotaExhaustedModel(chain[0])
    const resolve = resolverFor({ [spent.modelId]: spent })
    const audience = makeAudience()

    // All five fire at once, the way the chamber does (§5.3).
    const streams = await Promise.all(
      ['vane', 'marrow', 'hob'].map((id) =>
        requestPetition(COUNSELORS_BY_ID[id], audience, reign, {
          resolveLanguageModel: resolve,
          demoChunkDelayMs: 0,
        }),
      ),
    )

    for (const stream of streams) expect(stream.source).toBe('demo')
    // The pacer lets at most MAX_IN_FLIGHT dial out before the news lands.
    expect(spent.doStreamCalls.length).toBeLessThanOrEqual(MAX_IN_FLIGHT)
    // And the reason stays honest: nobody walked the chain to the paid router
    // and reported "every model refused".
    expect(getDemoState().reason).toBe('free-quota-spent')
    expect(getMetric('model_chain_exhausted')).toBe(0)
  })

  it('serves the recording when there is no key at all (T-13)', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '')
    resetDemoMode()

    const stream = await requestPetition(vane, makeAudience(), reign, {
      demoChunkDelayMs: 0,
    })

    expect(stream.source).toBe('demo')
    expect(await collect(stream.textStream)).toBe(demoPetition('vane'))
    expect(getDemoState().reason).toBe('missing-api-key')
  })
})

describe('the recording’s cadence', () => {
  it('never spends more than DEMO_MAX_CHUNKS ticks, however long the text', () => {
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')

    const chunks = chunkRecording(long)

    expect(chunks.length).toBeLessThanOrEqual(DEMO_MAX_CHUNKS)
    expect(chunks.join('')).toBe(long)
  })

  it('keeps a short line word by word', () => {
    expect(chunkRecording('So be it.')).toEqual(['So ', 'be ', 'it.'])
  })

  it('loses nothing from a real petition', async () => {
    const stream = await requestPetition(hob, makeAudience(), reign, {
      resolveLanguageModel: (modelId) => mockDeadModel(modelId),
      demoChunkDelayMs: 0,
    })

    expect(await collect(stream.textStream)).toBe(demoPetition('hob'))
  })
})

describe('requestDeliberationTurn (§5.4, T-11)', () => {
  const audience = makeAudience({ stage: 'deliberation', petitions })

  it('accepts a turn that disputes a named rival first time', async () => {
    const model = mockTextModel(
      modelChain('martial')[0],
      'Marrow prices a siege she has never stood in, sire.',
    )

    const turn = await requestDeliberationTurn(vane, audience, reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
    })

    expect(turn).toMatchObject({
      counselorId: 'vane',
      targetId: 'marrow',
      attempts: 1,
      violations: [],
      source: 'live',
    })
    expect(model.doStreamCalls).toHaveLength(1)
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(DELIBERATION_MAX_TOKENS)
  })

  it('retries once with a stricter reminder, then passes', async () => {
    const model = mockSequenceModel(modelChain('martial')[0], [
      'I agree with the council entirely, sire.',
      'Hob would have us wait, and waiting is how Harrow keeps the ridge.',
    ])
    const attempts: number[] = []

    const turn = await requestDeliberationTurn(vane, audience, reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
      onChunk: (_, { attempt }) => attempts.push(attempt),
    })

    expect(turn.attempts).toBe(2)
    expect(turn.targetId).toBe('hob')
    expect(turn.violations).toEqual([])
    expect(attempts).toEqual([1, 2])
    expect(getMetric('sycophancy_violation')).toBe(0)

    // The retry carries the rejected turn and the complaint.
    const retryPrompt = JSON.stringify(model.doStreamCalls[1].prompt)
    expect(retryPrompt).toContain('That will not do.')
    expect(retryPrompt).toContain('I agree with the council entirely, sire.')
  })

  it('keeps the second failure but counts it (T-11)', async () => {
    const model = mockTextModel(
      modelChain('martial')[0],
      'The council is wrong and I am right, sire.',
    )

    const turn = await requestDeliberationTurn(vane, audience, reign, {
      resolveLanguageModel: resolverFor({ [model.modelId]: model }),
    })

    expect(turn.attempts).toBe(2)
    expect(turn.violations).toContain('no-target-named')
    expect(turn.text).toBe('The council is wrong and I am right, sire.')
    // Still usable by the engine: a target is always resolved.
    expect(audience.seated).toContain(turn.targetId)
    expect(turn.targetId).not.toBe('vane')
    expect(getMetric('sycophancy_violation')).toBe(1)
  })

  it('falls back to a canned rebuttal that names someone seated', async () => {
    const turn = await requestDeliberationTurn(hob, audience, reign, {
      resolveLanguageModel: (modelId) => mockDeadModel(modelId),
      demoChunkDelayMs: 0,
    })

    expect(turn.source).toBe('demo')
    expect(audience.seated).toContain(turn.targetId)
    expect(turn.text.length).toBeGreaterThan(0)
    expect(turn.attempts).toBe(1)
  })
})

describe('requestVotes (§5.5, T-12)', () => {
  const audience = makeAudience({ stage: 'vote', petitions })
  const clerk = COUNCIL_MODELS[0]

  it('returns a valid tally for a fixture audience', async () => {
    const model = mockObjectModel(clerk, [
      {
        votes: [
          { voterId: 'vane', forId: 'hob', rationale: 'He wants it settled.' },
          {
            voterId: 'marrow',
            forId: 'hob',
            rationale: 'Cheapest of a bad field.',
          },
          {
            voterId: 'hob',
            forId: 'marrow',
            rationale: 'She counts, at least.',
          },
        ],
      },
    ])

    const result = await requestVotes(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.source).toBe('live')
    expect(result.repaired).toBe(false)
    expect(result.votes.map((vote) => vote.voterId)).toEqual(SEATED)
    expect(result.tally.leaders).toEqual(['hob'])
    expect(result.tally.hung).toBe(false)
  })

  it('strips an injected self-vote and repairs it once', async () => {
    const model = mockObjectModel(clerk, [
      {
        votes: [
          { voterId: 'vane', forId: 'vane', rationale: 'I back myself.' },
          { voterId: 'marrow', forId: 'hob', rationale: 'Cheapest.' },
          { voterId: 'hob', forId: 'marrow', rationale: 'She counts.' },
        ],
      },
      {
        votes: [
          { voterId: 'vane', forId: 'hob', rationale: 'Then the old man.' },
          { voterId: 'marrow', forId: 'hob', rationale: 'Cheapest.' },
          { voterId: 'hob', forId: 'marrow', rationale: 'She counts.' },
        ],
      },
    ])

    const result = await requestVotes(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.repaired).toBe(true)
    expect(result.problems.map((problem) => problem.kind)).toEqual([
      'self-vote',
    ])
    expect(result.votes).toHaveLength(3)
    expect(result.votes.every((vote) => vote.voterId !== vote.forId)).toBe(true)
    expect(getMetric('structured_repair')).toBe(1)
    expect(getMetric('structured_entry_dropped')).toBe(1)

    // The complaint went back to the model before the second attempt.
    const repairPrompt = JSON.stringify(model.doGenerateCalls[1].prompt)
    expect(repairPrompt).toContain('vane voted for themselves')
  })

  it('fills a seat the model never gives a vote, so the tally stays complete', async () => {
    const stubborn = {
      votes: [
        { voterId: 'marrow', forId: 'hob', rationale: 'Cheapest.' },
        { voterId: 'hob', forId: 'marrow', rationale: 'She counts.' },
      ],
    }
    const model = mockObjectModel(clerk, [stubborn, stubborn])

    const result = await requestVotes(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.filled).toEqual(['vane'])
    expect(result.votes).toHaveLength(3)
    expect(result.votes.map((vote) => vote.voterId)).toEqual(SEATED)
    expect(getMetric('structured_entry_filled')).toBe(1)
  })

  it('returns a hung council intact rather than breaking the tie (§5.5)', async () => {
    const model = mockObjectModel(clerk, [
      {
        votes: [
          {
            voterId: 'vane',
            forId: 'marrow',
            rationale: 'Her sum, not her nerve.',
          },
          { voterId: 'marrow', forId: 'hob', rationale: 'He is cheapest.' },
          { voterId: 'hob', forId: 'vane', rationale: 'At least he decides.' },
        ],
      },
    ])

    const result = await requestVotes(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.tally.counts).toEqual({ vane: 1, marrow: 1, hob: 1 })
    expect(result.tally.leaders).toEqual(SEATED)
    expect(result.tally.hung).toBe(true)
    expect(result.votes).toHaveLength(3)
  })

  it('returns the recorded tally when the chain is exhausted', async () => {
    const result = await requestVotes(audience, reign, {
      resolveLanguageModel: (modelId) => mockDeadModel(modelId),
    })

    expect(result.source).toBe('demo')
    expect(result.votes).toEqual(SEATED.map((id) => demoVote(id, SEATED)))
    expect(getDemoState().reason).toBe('all-models-failed')
  })
})

describe('requestReactions (§5.7, T-12)', () => {
  const audience = makeAudience({
    stage: 'aftermath',
    petitions,
    decree: {
      text: 'Open half the granaries. Hold the rest until the thaw is certain.',
      issuedAt: '2026-08-06T09:30:00.000Z',
    },
  })
  const clerk = COUNCIL_MODELS[0]

  it('returns one reaction per counselor', async () => {
    const model = mockObjectModel(clerk, [
      {
        reactions: [
          {
            counselorId: 'vane',
            mood: 'appalled',
            line: 'Half a war, sire.',
            favorDelta: -1,
          },
          {
            counselorId: 'marrow',
            mood: 'pleased',
            line: 'Half the cost.',
            favorDelta: 1,
          },
          {
            counselorId: 'hob',
            mood: 'neutral',
            line: 'Half a winter, then.',
            favorDelta: 0,
          },
        ],
      },
    ])

    const result = await requestReactions(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.source).toBe('live')
    expect(result.reactions.map((r) => r.counselorId)).toEqual(SEATED)
    expect(result.filled).toEqual([])
  })

  it('drops a counselor who is not seated and clamps a wild delta', async () => {
    const payload = {
      reactions: [
        {
          counselorId: 'vane',
          mood: 'appalled',
          line: 'Half a war.',
          favorDelta: -2,
        },
        {
          counselorId: 'wren',
          mood: 'scheming',
          line: 'Not at this table.',
          favorDelta: 2,
        },
        {
          counselorId: 'marrow',
          mood: 'pleased',
          line: 'Half the cost.',
          favorDelta: 2,
        },
        {
          counselorId: 'hob',
          mood: 'neutral',
          line: 'Half a winter.',
          favorDelta: 0,
        },
      ],
    }
    const model = mockObjectModel(clerk, [payload, payload])

    const result = await requestReactions(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.reactions.map((r) => r.counselorId)).toEqual(SEATED)
    expect(result.problems.map((problem) => problem.kind)).toEqual([
      'unknown-counselor',
      'unknown-counselor',
    ])
  })

  it('lets a skipped counselor react with silence', async () => {
    const payload = {
      reactions: [
        {
          counselorId: 'vane',
          mood: 'appalled',
          line: 'Half a war.',
          favorDelta: -1,
        },
        {
          counselorId: 'marrow',
          mood: 'pleased',
          line: 'Half the cost.',
          favorDelta: 1,
        },
      ],
    }
    const model = mockObjectModel(clerk, [payload, payload])

    const result = await requestReactions(audience, reign, {
      resolveLanguageModel: resolverFor({ [clerk]: model }),
    })

    expect(result.filled).toEqual(['hob'])
    const silent = result.reactions.find((r) => r.counselorId === 'hob')
    expect(silent).toMatchObject({ mood: 'neutral', favorDelta: 0 })
  })

  it('returns recorded reactions when the chain is exhausted', async () => {
    const result = await requestReactions(audience, reign, {
      resolveLanguageModel: (modelId) => mockDeadModel(modelId),
    })

    expect(result.source).toBe('demo')
    expect(result.reactions).toHaveLength(SEATED.length)
  })

  it('serves the recording when there is no key (T-13)', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '')
    resetDemoMode()

    const result = await requestReactions(audience, reign)

    expect(result.source).toBe('demo')
    expect(result.modelId).toBe(DEMO_MODEL_ID)
  })
})
