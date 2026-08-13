import { describe, expect, it } from 'vitest'
import type { Reaction } from '@/domain/audience'
import { MAX_FAVOR, MIN_FAVOR } from '@/domain/reign'
import { applyReactions, createDefaultReign } from './reign'

function reaction(counselorId: string, favorDelta: number): Reaction {
  return { counselorId, mood: 'neutral', line: '', favorDelta }
}

describe('applyReactions (T-20)', () => {
  it('folds favor deltas onto the reign', () => {
    const reign = createDefaultReign()
    const next = applyReactions(reign, [
      reaction('vane', 1),
      reaction('marrow', -1),
    ])

    expect(next.favor.vane).toBe(1)
    expect(next.favor.marrow).toBe(-1)
  })

  it('accumulates onto favor already standing', () => {
    const reign = { ...createDefaultReign(), favor: { vane: 3 } }
    const next = applyReactions(reign, [reaction('vane', 2)])
    expect(next.favor.vane).toBe(5)
  })

  it('clamps to the -10 … +10 band', () => {
    const reign = {
      ...createDefaultReign(),
      favor: { vane: 9, marrow: -9 },
    }
    const next = applyReactions(reign, [
      reaction('vane', 2),
      reaction('marrow', -2),
    ])
    expect(next.favor.vane).toBe(MAX_FAVOR)
    expect(next.favor.marrow).toBe(MIN_FAVOR)
  })

  it('does not mutate the input reign', () => {
    const reign = createDefaultReign()
    applyReactions(reign, [reaction('vane', 1)])
    expect(reign.favor).toEqual({})
  })

  it('is a no-op with no reactions', () => {
    const reign = createDefaultReign()
    expect(applyReactions(reign, [])).toBe(reign)
  })
})
