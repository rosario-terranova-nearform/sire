import { describe, expect, it } from 'vitest'
import {
  MAX_RATIONALE_WORDS,
  MAX_REACTION_WORDS,
  clampFavorDelta,
  mergeSanitizedVotes,
  reactionRepairInstruction,
  sanitizeReactions,
  sanitizeVotes,
  tallyVotes,
  truncateWords,
  voteRepairInstruction,
} from './sanitize'
import { SEATED } from '@/test/ai-fixtures'

describe('sanitizing a tally (§6.4)', () => {
  it('keeps a clean tally, in seating order', () => {
    const result = sanitizeVotes(
      [
        { voterId: 'hob', forId: 'marrow', rationale: 'She counts.' },
        { voterId: 'vane', forId: 'hob', rationale: 'He wants it settled.' },
        {
          voterId: 'marrow',
          forId: 'hob',
          rationale: 'Cheapest of a bad field.',
        },
      ],
      SEATED,
    )

    expect(result.votes.map((vote) => vote.voterId)).toEqual(SEATED)
    expect(result.problems).toEqual([])
    expect(result.missing).toEqual([])
  })

  it('strips a self-vote and reports it', () => {
    const result = sanitizeVotes(
      [
        { voterId: 'vane', forId: 'vane', rationale: 'I am right.' },
        { voterId: 'marrow', forId: 'hob', rationale: 'Cheapest.' },
        { voterId: 'hob', forId: 'marrow', rationale: 'She counts.' },
      ],
      SEATED,
    )

    expect(result.votes.map((vote) => vote.voterId)).toEqual(['marrow', 'hob'])
    expect(result.problems).toEqual([
      { kind: 'self-vote', voterId: 'vane', forId: 'vane' },
    ])
    expect(result.missing).toEqual(['vane'])
  })

  it('strips voters and targets who are not seated', () => {
    const result = sanitizeVotes(
      [
        { voterId: 'wren', forId: 'vane', rationale: 'Not at this table.' },
        { voterId: 'vane', forId: 'wren', rationale: 'Nor is she.' },
      ],
      SEATED,
    )

    expect(result.votes).toEqual([])
    expect(result.problems.map((problem) => problem.kind)).toEqual([
      'unknown-voter',
      'unknown-target',
    ])
  })

  it('keeps only a voter’s first vote', () => {
    const result = sanitizeVotes(
      [
        { voterId: 'vane', forId: 'hob', rationale: 'First.' },
        { voterId: 'vane', forId: 'marrow', rationale: 'Second.' },
      ],
      SEATED,
    )

    expect(result.votes).toHaveLength(1)
    expect(result.votes[0].forId).toBe('hob')
    expect(result.problems[0].kind).toBe('duplicate-voter')
  })

  it('caps a rationale at 20 words (§5.5)', () => {
    const rationale = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')

    const [vote] = sanitizeVotes(
      [{ voterId: 'vane', forId: 'hob', rationale }],
      SEATED,
    ).votes

    expect(vote.rationale.split(' ')).toHaveLength(MAX_RATIONALE_WORDS)
    expect(vote.rationale.endsWith('…')).toBe(true)
  })
})

describe('the tally itself (§5.5)', () => {
  it('counts backers per counselor', () => {
    const tally = tallyVotes(
      [
        { voterId: 'vane', forId: 'hob', rationale: '' },
        { voterId: 'marrow', forId: 'hob', rationale: '' },
        { voterId: 'hob', forId: 'marrow', rationale: '' },
      ],
      SEATED,
    )

    expect(tally.counts).toEqual({ vane: 0, marrow: 1, hob: 2 })
    expect(tally.leaders).toEqual(['hob'])
    expect(tally.hung).toBe(false)
  })

  it('reports a tie as hung, and never picks a winner', () => {
    const tally = tallyVotes(
      [
        { voterId: 'vane', forId: 'hob', rationale: '' },
        { voterId: 'hob', forId: 'vane', rationale: '' },
        { voterId: 'marrow', forId: 'vane', rationale: '' },
      ],
      ['vane', 'marrow', 'hob'],
    )

    expect(tally.counts).toEqual({ vane: 2, marrow: 0, hob: 1 })
    expect(tally.hung).toBe(false)

    const dead = tallyVotes(
      [
        { voterId: 'vane', forId: 'hob', rationale: '' },
        { voterId: 'hob', forId: 'vane', rationale: '' },
      ],
      ['vane', 'hob'],
    )

    expect(dead.leaders).toEqual(['vane', 'hob'])
    expect(dead.hung).toBe(true)
  })

  it('treats an empty tally as hung', () => {
    const tally = tallyVotes([], SEATED)

    expect(tally.leaders).toEqual([])
    expect(tally.hung).toBe(true)
  })
})

describe('sanitizing reactions (§5.7)', () => {
  it('clamps a favor delta into -2 … +2', () => {
    expect(clampFavorDelta(7)).toBe(2)
    expect(clampFavorDelta(-9)).toBe(-2)
    expect(clampFavorDelta(1.4)).toBe(1)
    expect(clampFavorDelta(Number.NaN)).toBe(0)
  })

  it('drops unknown counselors and reports out-of-range deltas', () => {
    const result = sanitizeReactions(
      [
        { counselorId: 'vane', mood: 'pleased', line: 'Good.', favorDelta: 2 },
        {
          counselorId: 'wren',
          mood: 'scheming',
          line: 'Not here.',
          favorDelta: 1,
        },
        { counselorId: 'hob', mood: 'appalled', line: 'Bad.', favorDelta: -5 },
      ],
      SEATED,
    )

    expect(result.reactions.map((r) => r.counselorId)).toEqual(['vane', 'hob'])
    expect(result.reactions[1].favorDelta).toBe(-2)
    expect(result.problems.map((problem) => problem.kind)).toEqual([
      'unknown-counselor',
      'delta-out-of-range',
    ])
    expect(result.missing).toEqual(['marrow'])
  })

  it('caps a reaction line at 15 words', () => {
    const line = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ')

    const [reaction] = sanitizeReactions(
      [{ counselorId: 'vane', mood: 'neutral', line, favorDelta: 0 }],
      SEATED,
    ).reactions

    expect(reaction.line.split(' ')).toHaveLength(MAX_REACTION_WORDS)
    expect(reaction.line.endsWith('…')).toBe(true)
  })
})

describe('the repair retry (§6.4)', () => {
  it('names every problem and every missing seat', () => {
    const instruction = voteRepairInstruction({
      problems: [{ kind: 'self-vote', voterId: 'vane', forId: 'vane' }],
      missing: ['marrow'],
    })

    expect(instruction).toContain('vane voted for themselves')
    expect(instruction).toContain('marrow cast no vote')
  })

  it('does the same for reactions', () => {
    const instruction = reactionRepairInstruction({
      problems: [{ kind: 'duplicate-counselor', counselorId: 'hob' }],
      missing: ['vane'],
    })

    expect(instruction).toContain('hob reacted more than once')
    expect(instruction).toContain('vane is missing')
  })

  it('keeps the first pass and takes only the missing seats from the repair', () => {
    const first = sanitizeVotes(
      [
        { voterId: 'vane', forId: 'vane', rationale: 'Self.' },
        { voterId: 'marrow', forId: 'hob', rationale: 'Kept.' },
      ],
      SEATED,
    )
    const repair = sanitizeVotes(
      [
        { voterId: 'vane', forId: 'hob', rationale: 'Repaired.' },
        {
          voterId: 'marrow',
          forId: 'vane',
          rationale: 'Ignored — already voted.',
        },
        { voterId: 'hob', forId: 'marrow', rationale: 'Added.' },
      ],
      SEATED,
    )

    const merged = mergeSanitizedVotes(first, repair, SEATED)

    expect(merged.votes.map((vote) => [vote.voterId, vote.rationale])).toEqual([
      ['vane', 'Repaired.'],
      ['marrow', 'Kept.'],
      ['hob', 'Added.'],
    ])
    expect(merged.missing).toEqual([])
  })
})

describe('truncateWords', () => {
  it('leaves short text alone and collapses whitespace', () => {
    expect(truncateWords('  two   words  ', 5)).toBe('two words')
  })
})
