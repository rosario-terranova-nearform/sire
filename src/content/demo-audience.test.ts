import { describe, expect, it } from 'vitest'
import {
  DEMO_AUDIENCE,
  DEMO_SEATED,
  demoDeliberation,
  demoExchange,
  demoPetition,
  demoReaction,
  demoReactions,
  demoVote,
  demoVotes,
} from './demo-audience'
import { COUNSELORS, COUNSELORS_BY_ID } from './counselors'
import { validateExchange } from '@/ai/validate-exchange'
import { audienceSchema } from '@/domain/schemas'
import { MAX_SEATED, MIN_SEATED } from '@/domain/audience'
import { audienceReducer } from '@/engine/audience-machine'

/** Every legal council that can be drawn from the six seeded counselors. */
function legalCouncils(): string[][] {
  const ids = COUNSELORS.map((counselor) => counselor.id)
  const councils: string[][] = []

  const walk = (start: number, picked: string[]) => {
    if (picked.length >= MIN_SEATED && picked.length <= MAX_SEATED) {
      councils.push([...picked])
    }
    if (picked.length === MAX_SEATED) return

    for (let index = start; index < ids.length; index += 1) {
      picked.push(ids[index])
      walk(index + 1, picked)
      picked.pop()
    }
  }

  walk(0, [])
  return councils
}

describe('the recording (§7.1, T-13)', () => {
  it('has canned counsel for every seeded counselor', () => {
    for (const counselor of COUNSELORS) {
      expect(demoPetition(counselor.id).length).toBeGreaterThan(80)
      expect(demoReaction(counselor.id).counselorId).toBe(counselor.id)
    }
  })

  it('says so plainly for a counselor it never recorded', () => {
    expect(demoPetition('a-custom-counselor')).toContain(
      'was not in the chamber',
    )
    expect(demoReaction('a-custom-counselor')).toMatchObject({
      mood: 'neutral',
      favorDelta: 0,
    })
  })

  it('always rebuts someone who is actually seated', () => {
    for (const seated of legalCouncils()) {
      for (const counselorId of seated) {
        const exchange = demoExchange(counselorId, seated)

        expect(exchange).not.toBeNull()
        expect(seated).toContain(exchange?.targetId)
        expect(exchange?.targetId).not.toBe(counselorId)
      }
    }
  })

  // The recording has to satisfy the same contract a live model does —
  // otherwise demo mode would be the one path where the council goes soft.
  it('passes the anti-sycophancy contract on every legal council (§5.4)', () => {
    for (const seated of legalCouncils()) {
      for (const counselorId of seated) {
        const exchange = demoExchange(counselorId, seated)
        if (exchange === null) continue

        const result = validateExchange(
          { counselorId, text: exchange.text, targetId: exchange.targetId },
          { seated, roster: COUNSELORS_BY_ID },
        )

        expect({ counselorId, seated, ...result }).toMatchObject({ ok: true })
      }
    }
  })

  it('always returns a complete tally with no self-votes', () => {
    for (const seated of legalCouncils()) {
      const votes = demoVotes(seated)

      expect(votes).toHaveLength(seated.length)
      expect(new Set(votes.map((vote) => vote.voterId)).size).toBe(
        seated.length,
      )
      for (const vote of votes) {
        expect(seated).toContain(vote.forId)
        expect(vote.forId).not.toBe(vote.voterId)
        expect(vote.rationale.split(/\s+/u).length).toBeLessThanOrEqual(20)
      }
    }
  })

  it('has nobody to vote for at a table of one', () => {
    expect(demoVote('vane', ['vane'])).toBeNull()
    expect(demoExchange('vane', ['vane'])).toBeNull()
  })

  it('keeps a reaction line inside the 15-word cap', () => {
    for (const reaction of demoReactions(DEMO_SEATED)) {
      expect(reaction.line.split(/\s+/u).length).toBeLessThanOrEqual(15)
      expect(reaction.favorDelta).toBeGreaterThanOrEqual(-2)
      expect(reaction.favorDelta).toBeLessThanOrEqual(2)
    }
  })

  it('puts the speaks-last counselor last on the floor (§5.4)', () => {
    const floor = demoDeliberation(DEMO_SEATED)

    expect(floor.at(-1)?.counselorId).toBe('wren')
    expect(floor.map((exchange) => exchange.order)).toEqual([0, 1, 2, 3, 4])
  })

  it('is a valid Audience end to end', () => {
    expect(() => audienceSchema.parse(DEMO_AUDIENCE)).not.toThrow()
    expect(DEMO_AUDIENCE.stage).toBe('aftermath')
    expect(DEMO_AUDIENCE.decree?.text.length).toBeGreaterThan(0)
    expect(DEMO_AUDIENCE.reactions).toHaveLength(DEMO_SEATED.length)
  })

  it('shows the whole four moods across the chamber, so sprites are exercised', () => {
    const moods = new Set(
      demoReactions(COUNSELORS.map((counselor) => counselor.id)).map(
        (reaction) => reaction.mood,
      ),
    )

    expect(moods).toEqual(
      new Set(['neutral', 'pleased', 'appalled', 'scheming']),
    )
  })

  it('produces a tally the engine will actually accept', () => {
    const atVote = { ...DEMO_AUDIENCE, stage: 'vote' as const, votes: [] }

    const next = audienceReducer(atVote, {
      type: 'record-votes',
      votes: demoVotes(DEMO_SEATED),
    })

    expect(next).not.toBe(atVote)
    expect(next.votes).toHaveLength(DEMO_SEATED.length)
  })
})
