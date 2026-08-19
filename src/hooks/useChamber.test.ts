import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChamber, type ChamberDeps } from './useChamber'
import type { Audience, Reaction } from '@/domain/audience'
import { createAudience } from '@/engine/audience-machine'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { createDefaultReign } from '@/lib/reign'
import { tallyVotes } from '@/ai/sanitize'
import type {
  CounselStream,
  DeliberationTurn,
  ReactionsResult,
  VotesResult,
} from '@/ai/calls'

/** An audience seated and already advanced to `petition`, as the seating
 *  screen hands it over. */
function petitioningAudience(seated: string[]): Audience {
  const base = createAudience({
    id: 'test-audience',
    createdAt: '2026-08-12T00:00:00.000Z',
    question: 'Should I take the Duke up on his offer?',
    seated,
  })
  return { ...base, stage: 'petition' }
}

function streamOf(counselorId: string, text: string): CounselStream {
  async function* gen() {
    for (const word of text.split(' ')) {
      await Promise.resolve()
      yield `${word} `
    }
  }
  return { counselorId, modelId: 'test', source: 'live', textStream: gen() }
}

/** A scripted tally: everyone backs the first other seated counselor. */
function votesFor(audience: Audience): Promise<VotesResult> {
  const seated = audience.seated
  const votes = seated.map((voterId) => ({
    voterId,
    forId: seated.find((id) => id !== voterId) ?? voterId,
    rationale: 'scripted',
  }))
  return Promise.resolve({
    votes,
    tally: tallyVotes(votes, seated),
    modelId: 'test',
    source: 'live',
    repaired: false,
    problems: [],
    filled: [],
  })
}

/** A scripted aftermath: +1 favor for everyone. */
function reactionsFor(audience: Audience): Promise<ReactionsResult> {
  const reactions: Reaction[] = audience.seated.map((counselorId) => ({
    counselorId,
    mood: 'pleased',
    line: 'As you say, sire.',
    favorDelta: 1,
  }))
  return Promise.resolve({
    reactions,
    modelId: 'test',
    source: 'live',
    repaired: false,
    problems: [],
    filled: [],
  })
}

/** Every scripted call, for a chamber test that only cares about one stage. */
function scriptedDeps(): Partial<ChamberDeps> {
  return {
    requestPetition: (counselor) =>
      Promise.resolve(streamOf(counselor.id, `${counselor.name} speaks`)),
    requestDeliberationTurn: (counselor, audience) =>
      Promise.resolve(turnFor(counselor.id, audience.seated)),
    requestVotes: (audience) => votesFor(audience),
    requestReactions: (audience) => reactionsFor(audience),
  }
}

describe('useChamber — petition stage (T-17)', () => {
  it('streams every seat and completes the stage when all close', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) =>
        Promise.resolve(streamOf(counselor.id, `${counselor.name} speaks`)),
      requestDeliberationTurn: (counselor, audience) =>
        Promise.resolve(turnFor(counselor.id, audience.seated)),
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))

    for (const id of seated) {
      const view = result.current.petitions.find((p) => p.counselorId === id)
      expect(view?.status).toBe('complete')
      expect(view?.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('lets a single failing petition close without blocking the others', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) =>
        counselor.id === 'marrow'
          ? Promise.reject(new Error('every model refused'))
          : Promise.resolve(streamOf(counselor.id, 'a plain petition here')),
      requestDeliberationTurn: (counselor, audience) =>
        Promise.resolve(turnFor(counselor.id, audience.seated)),
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))

    const marrow = result.current.petitions.find((p) => p.counselorId === 'marrow')
    expect(marrow?.status).toBe('silent')
    // The healthy seats still spoke, and the room still moved on.
    expect(
      result.current.petitions
        .filter((p) => p.counselorId !== 'marrow')
        .every((p) => p.status === 'complete'),
    ).toBe(true)
  })

  // §5.7 / T-23 — favor ≤ -8 empties a seat. The counselor is never asked to
  // petition or take the floor; the fool is exempt and attends from any depth.
  it('drops a counselor in deep disfavor and never calls them, but keeps the exempt fool', async () => {
    const seated = ['vane', 'grin', 'marrow']
    const petitioned: string[] = []
    const deliberated: string[] = []
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) => {
        petitioned.push(counselor.id)
        return Promise.resolve(streamOf(counselor.id, `${counselor.name} speaks`))
      },
      requestDeliberationTurn: (counselor, audience) => {
        deliberated.push(counselor.id)
        return Promise.resolve(turnFor(counselor.id, audience.seated))
      },
    }

    // vane is banished by favor; grin is at the same depth but exempt.
    const reign = {
      ...createDefaultReign(),
      favor: { vane: -8, grin: -10 },
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign,
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))

    const vane = result.current.petitions.find((p) => p.counselorId === 'vane')
    expect(vane?.status).toBe('absent')
    expect(petitioned).not.toContain('vane')
    expect(deliberated).not.toContain('vane')

    // Grin sat down and spoke like anyone else.
    expect(petitioned).toContain('grin')
    expect(deliberated).toContain('grin')
    const grin = result.current.petitions.find((p) => p.counselorId === 'grin')
    expect(grin?.status).toBe('complete')
  })
})

describe('useChamber — deliberation stage (T-18)', () => {
  it('runs the floor in speaking order with speaks-last last', async () => {
    // Wren carries `speaks-last`; whatever the shuffle, she lands at the end.
    const seated = ['vane', 'marrow', 'wren']
    const callOrder: string[] = []
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) =>
        Promise.resolve(streamOf(counselor.id, 'a petition')),
      requestDeliberationTurn: (counselor, audience) => {
        callOrder.push(counselor.id)
        return Promise.resolve(turnFor(counselor.id, audience.seated))
      },
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))

    expect(callOrder).toHaveLength(3)
    expect(callOrder.at(-1)).toBe('wren')
    // The transcript mirrors the call order and every turn names a seated rival.
    const transcript = result.current.turns
    expect(transcript.map((t) => t.counselorId)).toEqual(callOrder)
    expect(transcript.at(-1)?.counselorId).toBe('wren')
    for (const turn of transcript) {
      expect(seated).toContain(turn.targetId)
      expect(turn.targetId).not.toBe(turn.counselorId)
    }
  })
})

describe('useChamber — vote and decree (T-19)', () => {
  it('holds at the decree with a settled tally, then advances on a ruling', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps: scriptedDeps(),
      }),
    )

    // The auto-run stops at the decree — the ruling is the monarch's.
    await waitFor(() => expect(result.current.phase).toBe('decree'))
    expect(result.current.tally).not.toBeNull()
    expect(result.current.votes).toHaveLength(seated.length)

    act(() => result.current.issueDecree('Let it be done.', 'vane'))

    await waitFor(() => expect(result.current.phase).toBe('aftermath'))
    expect(result.current.audience.decree?.text).toBe('Let it be done.')
    expect(result.current.audience.decree?.sidedWithId).toBe('vane')
  })

  it('ignores an empty ruling and keeps holding at the decree', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps: scriptedDeps(),
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))
    act(() => result.current.issueDecree('   '))

    expect(result.current.phase).toBe('decree')
    expect(result.current.audience.decree).toBeUndefined()
  })
})

describe('useChamber — aftermath (T-20)', () => {
  it('records reactions and hands the finished audience up so favor can be applied', async () => {
    const seated = ['vane', 'marrow', 'grin']
    let handedUpReactions: readonly Reaction[] | null = null
    let handedUpAudience: Audience | null = null

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        onAftermath: (audience, reactions) => {
          handedUpAudience = audience
          handedUpReactions = reactions
        },
        deps: scriptedDeps(),
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))
    act(() => result.current.issueDecree('So be it.'))

    await waitFor(() => expect(result.current.phase).toBe('aftermath'))
    expect(result.current.reactions).toHaveLength(seated.length)
    expect(handedUpReactions).not.toBeNull()
    expect(handedUpReactions!).toHaveLength(seated.length)
    // The audience handed up carries the decree and the recorded reactions, so
    // the caller can commit heard counts and memory in one pass (T-23).
    expect(handedUpAudience).not.toBeNull()
    expect(handedUpAudience!.decree?.text).toBe('So be it.')
    expect(handedUpAudience!.reactions).toHaveLength(seated.length)
  })
})

describe('useChamber — screen-reader announcements (T-24)', () => {
  it('emits one announcement per completed petition and per floor turn', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign: createDefaultReign(),
        deps: scriptedDeps(),
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))

    const { announcements } = result.current
    // Three petitions + three floor turns, each announced exactly once.
    const petitionLines = announcements.filter((a) => a.includes('petitions:'))
    const rebuttalLines = announcements.filter((a) => a.includes('rebuts'))
    expect(petitionLines).toHaveLength(3)
    expect(rebuttalLines).toHaveLength(3)
    // The text is the finished turn, not a per-token fragment.
    expect(petitionLines.some((a) => a.includes('Lord Marshal Vane'))).toBe(true)
  })

  it('announces an absent seat once, in-world', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const reign = { ...createDefaultReign(), favor: { vane: -9 } }
    const { result } = renderHook(() =>
      useChamber({
        initialAudience: petitioningAudience(seated),
        reign,
        deps: scriptedDeps(),
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))
    expect(
      result.current.announcements.filter((a) =>
        a.includes('sends no word'),
      ),
    ).toHaveLength(1)
  })
})

describe('useChamber — resume a persisted audience (T-25)', () => {
  it('resumes at the decree hold without re-running the AI stages', async () => {
    const seated = ['vane', 'marrow', 'grin']
    let petitionCalls = 0
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) => {
        petitionCalls += 1
        return Promise.resolve(streamOf(counselor.id, 'should never run'))
      },
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: settledAudience(seated, 'decree'),
        reign: createDefaultReign(),
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))
    // No stream was reopened; the persisted transcript stands as-is.
    expect(petitionCalls).toBe(0)
    expect(result.current.tally).not.toBeNull()
    expect(result.current.votes).toHaveLength(seated.length)
    // The persisted petitions show as complete without re-streaming.
    expect(
      result.current.petitions.every((p) => p.status === 'complete'),
    ).toBe(true)
  })

  it('resumes and then completes: the monarch can still rule', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const { result } = renderHook(() =>
      useChamber({
        initialAudience: settledAudience(seated, 'decree'),
        reign: createDefaultReign(),
        deps: scriptedDeps(),
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('decree'))
    act(() => result.current.issueDecree('Resumed and ruled.'))

    await waitFor(() => expect(result.current.phase).toBe('aftermath'))
    expect(result.current.audience.decree?.text).toBe('Resumed and ruled.')
    expect(result.current.reactions).toHaveLength(seated.length)
  })

  it('reopens a finished audience straight to the aftermath', async () => {
    const seated = ['vane', 'marrow', 'grin']
    let petitionCalls = 0
    const deps: Partial<ChamberDeps> = {
      ...scriptedDeps(),
      requestPetition: (counselor) => {
        petitionCalls += 1
        return Promise.resolve(streamOf(counselor.id, 'should never run'))
      },
    }

    const { result } = renderHook(() =>
      useChamber({
        initialAudience: settledAudience(seated, 'aftermath'),
        reign: createDefaultReign(),
        deps,
      }),
    )

    await waitFor(() => expect(result.current.phase).toBe('aftermath'))
    expect(petitionCalls).toBe(0)
    expect(result.current.reactions).toHaveLength(seated.length)
    expect(result.current.audience.decree?.text).toBe('So be it.')
  })
})

/** A persisted audience past the AI stages: every petition closed, the floor
 *  spoken, the tally in. At `aftermath` it also carries a decree and reactions. */
function settledAudience(
  seated: string[],
  stage: 'decree' | 'aftermath',
): Audience {
  const base = createAudience({
    id: 'settled-audience',
    createdAt: '2026-08-12T00:00:00.000Z',
    question: 'Should I take the Duke up on his offer?',
    seated,
  })
  const petitions = seated.map((id) => ({
    counselorId: id,
    text: `${COUNSELORS_BY_ID[id]?.name ?? id} has spoken.`,
    complete: true,
  }))
  const deliberation = seated.map((id, order) => {
    const targetId = seated.find((other) => other !== id) ?? id
    return { counselorId: id, targetId, text: `${id} disputes ${targetId}.`, order }
  })
  const votes = seated.map((id) => ({
    voterId: id,
    forId: seated.find((other) => other !== id) ?? id,
    rationale: 'scripted',
  }))

  if (stage === 'decree') {
    return { ...base, stage: 'decree', petitions, deliberation, votes }
  }
  const reactions: Reaction[] = seated.map((id) => ({
    counselorId: id,
    mood: 'pleased',
    line: 'As you say, sire.',
    favorDelta: 1,
  }))
  return {
    ...base,
    stage: 'aftermath',
    petitions,
    deliberation,
    votes,
    decree: { text: 'So be it.', issuedAt: '2026-08-12T01:00:00.000Z' },
    reactions,
  }
}

/** A valid deliberation turn: rebuts the first other seated counselor. */
function turnFor(counselorId: string, seated: string[]): DeliberationTurn {
  const targetId = seated.find((id) => id !== counselorId) ?? counselorId
  return {
    counselorId,
    targetId,
    text: `${COUNSELORS_BY_ID[counselorId]?.name ?? counselorId} disputes ${
      COUNSELORS_BY_ID[targetId]?.name ?? targetId
    }.`,
    modelId: 'test',
    source: 'live',
    attempts: 1,
    violations: [],
  }
}
