import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChamber, type ChamberDeps } from './useChamber'
import type { Audience } from '@/domain/audience'
import { createAudience } from '@/engine/audience-machine'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { createDefaultReign } from '@/lib/reign'
import type { CounselStream, DeliberationTurn } from '@/ai/calls'

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

describe('useChamber — petition stage (T-17)', () => {
  it('streams every seat and completes the stage when all close', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const deps: Partial<ChamberDeps> = {
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

    await waitFor(() => expect(result.current.phase).toBe('concluded'))

    for (const id of seated) {
      const view = result.current.petitions.find((p) => p.counselorId === id)
      expect(view?.status).toBe('complete')
      expect(view?.text.trim().length).toBeGreaterThan(0)
    }
  })

  it('lets a single failing petition close without blocking the others', async () => {
    const seated = ['vane', 'marrow', 'grin']
    const deps: Partial<ChamberDeps> = {
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

    await waitFor(() => expect(result.current.phase).toBe('concluded'))

    const marrow = result.current.petitions.find((p) => p.counselorId === 'marrow')
    expect(marrow?.status).toBe('silent')
    // The healthy seats still spoke, and the room still moved on.
    expect(
      result.current.petitions
        .filter((p) => p.counselorId !== 'marrow')
        .every((p) => p.status === 'complete'),
    ).toBe(true)
  })
})

describe('useChamber — deliberation stage (T-18)', () => {
  it('runs the floor in speaking order with speaks-last last', async () => {
    // Wren carries `speaks-last`; whatever the shuffle, she lands at the end.
    const seated = ['vane', 'marrow', 'wren']
    const callOrder: string[] = []
    const deps: Partial<ChamberDeps> = {
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

    await waitFor(() => expect(result.current.phase).toBe('concluded'))

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
