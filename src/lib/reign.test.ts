import { describe, expect, it } from 'vitest'
import type { Audience, Reaction } from '@/domain/audience'
import type { Reign } from '@/domain/reign'
import {
  AGENDA_REVEAL_AT,
  FAVOR_ABSENT_AT,
  FAVOR_GENEROUS_AT,
  FAVOR_TERSE_AT,
  MAX_FAVOR,
  MIN_FAVOR,
} from '@/domain/reign'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { makeAudience } from '@/test/ai-fixtures'
import {
  applyReactions,
  commitAudience,
  createDefaultReign,
  favorPosture,
  refusesToAttend,
  spokenInAudience,
} from './reign'

function reaction(counselorId: string, favorDelta: number): Reaction {
  return { counselorId, mood: 'neutral', line: '', favorDelta }
}

/** vane is an ordinary counselor; grin holds the `licensed-tongue` exemption. */
const vane = COUNSELORS_BY_ID.vane
const grin = COUNSELORS_BY_ID.grin

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

describe('favorPosture (§5.7, T-23)', () => {
  const posture = (favor: number) =>
    favorPosture(vane, { ...createDefaultReign(), favor: { vane: favor } })

  it('is normal in the middle of the band', () => {
    expect(posture(0)).toBe('normal')
    expect(posture(FAVOR_TERSE_AT + 1)).toBe('normal')
    expect(posture(FAVOR_GENEROUS_AT - 1)).toBe('normal')
  })

  it('turns terse at or below the terse threshold', () => {
    expect(posture(FAVOR_TERSE_AT)).toBe('terse')
    expect(posture(FAVOR_TERSE_AT - 1)).toBe('terse')
  })

  it('turns absent at or below the absent threshold', () => {
    expect(posture(FAVOR_ABSENT_AT)).toBe('absent')
    expect(posture(MIN_FAVOR)).toBe('absent')
    expect(refusesToAttend(vane, {
      ...createDefaultReign(),
      favor: { vane: FAVOR_ABSENT_AT },
    })).toBe(true)
  })

  it('turns generous at or above the generous threshold', () => {
    expect(posture(FAVOR_GENEROUS_AT)).toBe('generous')
    expect(posture(MAX_FAVOR)).toBe('generous')
  })

  it('defaults an unscored counselor to normal', () => {
    expect(favorPosture(vane, createDefaultReign())).toBe('normal')
  })

  it('exempts the fool (licensed-tongue) at every extreme (§4, decision §11.6)', () => {
    const bottomed = { ...createDefaultReign(), favor: { grin: MIN_FAVOR } }
    const topped = { ...createDefaultReign(), favor: { grin: MAX_FAVOR } }
    expect(favorPosture(grin, bottomed)).toBe('normal')
    expect(favorPosture(grin, topped)).toBe('normal')
    expect(refusesToAttend(grin, bottomed)).toBe(false)
  })
})

describe('spokenInAudience (§3, T-23)', () => {
  it('counts a counselor who laid a petition or took the floor', () => {
    const audience = makeAudience({
      petitions: [{ counselorId: 'vane', text: 'March, sire.', complete: true }],
      deliberation: [
        { counselorId: 'marrow', targetId: 'vane', text: 'The vault, sire.', order: 0 },
      ],
    })
    expect(spokenInAudience(audience).sort()).toEqual(['marrow', 'vane'])
  })

  it('ignores an empty petition — a held tongue was not heard', () => {
    const audience = makeAudience({
      petitions: [
        { counselorId: 'vane', text: '   ', complete: true },
        { counselorId: 'hob', text: 'My boy carries the spear.', complete: true },
      ],
      deliberation: [],
    })
    expect(spokenInAudience(audience)).toEqual(['hob'])
  })
})

describe('commitAudience (§3 / §5.7, T-23)', () => {
  function audienceWhereAllSpoke(): Audience {
    return makeAudience({
      seated: ['vane', 'marrow', 'hob'],
      petitions: [
        { counselorId: 'vane', text: 'March, sire.', complete: true },
        { counselorId: 'marrow', text: 'Four thousand crowns.', complete: true },
        { counselorId: 'hob', text: 'My boy carries the spear.', complete: true },
      ],
      decree: {
        text: 'We march at the thaw.',
        issuedAt: '2026-08-18T12:00:00.000Z',
      },
    })
  }

  it('applies favor, bumps heard counts, and appends the decree to memory', () => {
    const { reign } = commitAudience(createDefaultReign(), audienceWhereAllSpoke(), [
      reaction('vane', 2),
      reaction('marrow', -1),
    ])

    expect(reign.favor.vane).toBe(2)
    expect(reign.favor.marrow).toBe(-1)
    expect(reign.heardCount).toEqual({ vane: 1, marrow: 1, hob: 1 })
    expect(reign.history).toHaveLength(1)
    expect(reign.history[0]).toMatchObject({
      question: audienceWhereAllSpoke().question,
      decree: 'We march at the thaw.',
    })
  })

  it('unmasks an agenda the third time a counselor speaks, and names it', () => {
    let reign: Reign = {
      ...createDefaultReign(),
      heardCount: { vane: AGENDA_REVEAL_AT - 2 },
    }

    // Second time heard — still short of the threshold, nothing unmasks.
    const first = commitAudience(reign, audienceWhereAllSpoke(), [])
    expect(first.reign.heardCount.vane).toBe(AGENDA_REVEAL_AT - 1)
    expect(first.newlyRevealed).not.toContain('vane')
    expect(first.reign.revealedAgendas).not.toContain('vane')

    // Third time — the mask slips.
    reign = first.reign
    const second = commitAudience(reign, audienceWhereAllSpoke(), [])
    expect(second.reign.heardCount.vane).toBe(AGENDA_REVEAL_AT)
    expect(second.newlyRevealed).toContain('vane')
    expect(second.reign.revealedAgendas).toContain('vane')
  })

  it('reveals an agenda only once — a later audience does not re-announce it', () => {
    const reign = {
      ...createDefaultReign(),
      heardCount: { vane: AGENDA_REVEAL_AT },
      revealedAgendas: ['vane'],
    }
    const { newlyRevealed, reign: next } = commitAudience(
      reign,
      audienceWhereAllSpoke(),
      [],
    )
    expect(newlyRevealed).not.toContain('vane')
    expect(next.revealedAgendas).toEqual(['vane'])
  })

  it('does not mutate the input reign', () => {
    const reign = createDefaultReign()
    commitAudience(reign, audienceWhereAllSpoke(), [reaction('vane', 1)])
    expect(reign.favor).toEqual({})
    expect(reign.heardCount).toEqual({})
    expect(reign.history).toEqual([])
  })
})
