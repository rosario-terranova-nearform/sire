import type { Reaction, Vote } from '@/domain/audience'
import type { RawReaction, RawVote } from './schemas'

/**
 * The business rules a Zod schema cannot express (§6.4): no self-votes, every
 * seated counselor present, every id within `seated`, favor deltas in range.
 *
 * Nothing here throws. A malformed entry is dropped and reported, because
 * losing one vote is a smaller failure than losing the stage.
 */

export const MAX_RATIONALE_WORDS = 20
export const MAX_REACTION_WORDS = 15
export const MIN_FAVOR_DELTA = -2
export const MAX_FAVOR_DELTA = 2

export type VoteProblemKind =
  'unknown-voter' | 'unknown-target' | 'self-vote' | 'duplicate-voter'

export interface VoteProblem {
  kind: VoteProblemKind
  voterId: string
  forId: string
}

export interface SanitizedVotes {
  votes: Vote[]
  problems: VoteProblem[]
  /** Seated counselors left without a vote. */
  missing: string[]
}

export type ReactionProblemKind =
  'unknown-counselor' | 'duplicate-counselor' | 'delta-out-of-range'

export interface ReactionProblem {
  kind: ReactionProblemKind
  counselorId: string
}

export interface SanitizedReactions {
  reactions: Reaction[]
  problems: ReactionProblem[]
  missing: string[]
}

export function sanitizeVotes(
  raw: readonly RawVote[],
  seated: readonly string[],
): SanitizedVotes {
  const votes: Vote[] = []
  const problems: VoteProblem[] = []
  const counted = new Set<string>()

  for (const entry of raw) {
    const voterId = entry.voterId.trim()
    const forId = entry.forId.trim()
    const problem = (kind: VoteProblemKind) => {
      problems.push({ kind, voterId, forId })
    }

    if (!seated.includes(voterId)) {
      problem('unknown-voter')
      continue
    }
    if (counted.has(voterId)) {
      problem('duplicate-voter')
      continue
    }
    if (voterId === forId) {
      problem('self-vote')
      continue
    }
    if (!seated.includes(forId)) {
      problem('unknown-target')
      continue
    }

    counted.add(voterId)
    votes.push({
      voterId,
      forId,
      rationale: truncateWords(entry.rationale, MAX_RATIONALE_WORDS),
    })
  }

  return {
    votes: sortBySeating(votes, seated, (vote) => vote.voterId),
    problems,
    missing: seated.filter((id) => !counted.has(id)),
  }
}

export function sanitizeReactions(
  raw: readonly RawReaction[],
  seated: readonly string[],
): SanitizedReactions {
  const reactions: Reaction[] = []
  const problems: ReactionProblem[] = []
  const counted = new Set<string>()

  for (const entry of raw) {
    const counselorId = entry.counselorId.trim()

    if (!seated.includes(counselorId)) {
      problems.push({ kind: 'unknown-counselor', counselorId })
      continue
    }
    if (counted.has(counselorId)) {
      problems.push({ kind: 'duplicate-counselor', counselorId })
      continue
    }

    const favorDelta = clampFavorDelta(entry.favorDelta)
    if (favorDelta !== entry.favorDelta) {
      problems.push({ kind: 'delta-out-of-range', counselorId })
    }

    counted.add(counselorId)
    reactions.push({
      counselorId,
      mood: entry.mood,
      line: truncateWords(entry.line, MAX_REACTION_WORDS),
      favorDelta,
    })
  }

  return {
    reactions: sortBySeating(
      reactions,
      seated,
      (reaction) => reaction.counselorId,
    ),
    problems,
    missing: seated.filter((id) => !counted.has(id)),
  }
}

export function clampFavorDelta(delta: number): number {
  const whole = Number.isFinite(delta) ? Math.round(delta) : 0
  return Math.min(MAX_FAVOR_DELTA, Math.max(MIN_FAVOR_DELTA, whole))
}

/** Hard word cap, kept whole-word so a rationale never ends mid-syllable. */
export function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (words.length <= max) return words.join(' ')
  return `${words.slice(0, max).join(' ')}…`
}

export interface Tally {
  /** Every seated id, including the ones nobody backed. */
  counts: Record<string, number>
  /** Ids tied at the top. Empty when nobody was backed at all. */
  leaders: string[]
  /** §5.5 — a tie is a hung council, never a coin flip. */
  hung: boolean
}

export function tallyVotes(
  votes: readonly Vote[],
  seated: readonly string[],
): Tally {
  const counts: Record<string, number> = Object.fromEntries(
    seated.map((id) => [id, 0]),
  )

  for (const vote of votes) {
    if (!(vote.forId in counts)) continue
    counts[vote.forId] += 1
  }

  const top = Math.max(0, ...Object.values(counts))
  const leaders = top === 0 ? [] : seated.filter((id) => counts[id] === top)

  return { counts, leaders, hung: leaders.length !== 1 }
}

/** The prompt-facing complaint that drives the one repair retry (§6.4). */
export function voteRepairInstruction(
  sanitized: Pick<SanitizedVotes, 'problems' | 'missing'>,
): string {
  const complaints = sanitized.problems.map((problem) => {
    switch (problem.kind) {
      case 'self-vote':
        return `- ${problem.voterId} voted for themselves. No counselor may do that.`
      case 'unknown-voter':
        return `- "${problem.voterId}" is not seated at this council.`
      case 'unknown-target':
        return `- ${problem.voterId} voted for "${problem.forId}", who is not seated.`
      case 'duplicate-voter':
        return `- ${problem.voterId} voted more than once.`
    }
  })

  const missing = sanitized.missing.map(
    (id) => `- ${id} cast no vote. Every counselor votes.`,
  )

  return [
    'That tally cannot be entered in the record:',
    ...complaints,
    ...missing,
    '',
    'Record the whole tally again: one vote for each id, no self-votes, ids exactly as given.',
  ].join('\n')
}

export function reactionRepairInstruction(
  sanitized: Pick<SanitizedReactions, 'problems' | 'missing'>,
): string {
  const complaints = sanitized.problems.map((problem) => {
    switch (problem.kind) {
      case 'unknown-counselor':
        return `- "${problem.counselorId}" is not seated at this council.`
      case 'duplicate-counselor':
        return `- ${problem.counselorId} reacted more than once.`
      case 'delta-out-of-range':
        return `- ${problem.counselorId}'s favorDelta is outside -2 to 2.`
    }
  })

  const missing = sanitized.missing.map(
    (id) => `- ${id} is missing. Every counselor in the chamber reacts.`,
  )

  return [
    'That record of the chamber cannot be entered:',
    ...complaints,
    ...missing,
    '',
    'Record it again: one entry for each id, mood from the four given, favorDelta a whole number from -2 to 2.',
  ].join('\n')
}

/** Keep the first pass's work; take from the repair only what is still missing. */
export function mergeSanitizedVotes(
  first: SanitizedVotes,
  second: SanitizedVotes,
  seated: readonly string[],
): SanitizedVotes {
  const votes = [...first.votes]
  const have = new Set(votes.map((vote) => vote.voterId))

  for (const vote of second.votes) {
    if (have.has(vote.voterId)) continue
    have.add(vote.voterId)
    votes.push(vote)
  }

  return {
    votes: sortBySeating(votes, seated, (vote) => vote.voterId),
    problems: [...first.problems, ...second.problems],
    missing: seated.filter((id) => !have.has(id)),
  }
}

export function mergeSanitizedReactions(
  first: SanitizedReactions,
  second: SanitizedReactions,
  seated: readonly string[],
): SanitizedReactions {
  const reactions = [...first.reactions]
  const have = new Set(reactions.map((reaction) => reaction.counselorId))

  for (const reaction of second.reactions) {
    if (have.has(reaction.counselorId)) continue
    have.add(reaction.counselorId)
    reactions.push(reaction)
  }

  return {
    reactions: sortBySeating(
      reactions,
      seated,
      (reaction) => reaction.counselorId,
    ),
    problems: [...first.problems, ...second.problems],
    missing: seated.filter((id) => !have.has(id)),
  }
}

/** Transcript order is seating order, whatever order the model answered in. */
export function sortBySeating<T>(
  items: readonly T[],
  seated: readonly string[],
  key: (item: T) => string,
): T[] {
  return [...items].sort(
    (a, b) => seated.indexOf(key(a)) - seated.indexOf(key(b)),
  )
}
