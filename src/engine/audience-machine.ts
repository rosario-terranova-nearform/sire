import {
  MAX_DECREE_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_SEATED,
  MIN_SEATED,
  type Audience,
  type Decree,
  type Exchange,
  type Reaction,
  type Stage,
  type Vote,
} from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'

/**
 * The stage engine (§5): a pure reducer over `Audience`.
 *
 * No fetches, no React, no clocks, no randomness — every non-deterministic
 * input (ids, timestamps, shuffle) is passed in by the caller. Illegal
 * actions are rejected by returning the *same state reference*, so a UI bug
 * can never corrupt a transcript and `next === prev` is the test for
 * "rejected".
 */

/** The only legal transitions. Strictly forward, one step at a time (§5). */
const NEXT_STAGE: Readonly<Record<Stage, Stage | null>> = {
  composing: 'seating',
  seating: 'petition',
  petition: 'deliberation',
  deliberation: 'vote',
  vote: 'decree',
  decree: 'aftermath',
  aftermath: null,
}

export type AudienceAction =
  /** §5.1 — user writes the question. */
  | { type: 'set-question'; question: string }
  /** §5.2 — user seats 3–5 counselors. */
  | { type: 'seat-council'; seated: string[] }
  /** Move to the next stage, if its preconditions are met. */
  | { type: 'advance' }
  /** §5.3 — a petition stream emitted more text. */
  | { type: 'petition-chunk'; counselorId: string; text: string }
  /** §5.3 — a petition stream closed. */
  | { type: 'petition-complete'; counselorId: string }
  /** §5.4 — one deliberation turn. `order` is assigned by the engine. */
  | {
      type: 'add-exchange'
      exchange: Omit<Exchange, 'order'>
    }
  /** §5.5 — the whole tally, from one `generateObject` call. */
  | { type: 'record-votes'; votes: Vote[] }
  /** §5.6 — the monarch rules. */
  | { type: 'issue-decree'; decree: Decree }
  /** §5.7 — one reaction per seated counselor. */
  | { type: 'record-reactions'; reactions: Reaction[] }

export interface CreateAudienceInput {
  id: string
  createdAt: string
  question?: string
  seated?: string[]
}

export function createAudience({
  id,
  createdAt,
  question = '',
  seated = [],
}: CreateAudienceInput): Audience {
  return {
    id,
    question,
    seated,
    stage: 'composing',
    petitions: [],
    deliberation: [],
    votes: [],
    reactions: [],
    createdAt,
  }
}

/** Is `to` reachable from `from` in one step? */
export function isLegalTransition(from: Stage, to: Stage): boolean {
  return NEXT_STAGE[from] === to
}

/**
 * Whether the audience currently satisfies the exit conditions of its stage.
 * Exported so the UI can enable/disable the "continue" affordance without
 * dispatching a doomed action.
 */
export function canAdvance(audience: Audience): boolean {
  const { stage, seated } = audience

  switch (stage) {
    case 'composing':
      return isValidQuestion(audience.question)
    case 'seating':
      return isValidCouncil(seated)
    case 'petition':
      // Every seated counselor has a petition and every stream has closed.
      return (
        seated.length > 0 &&
        seated.every((id) =>
          audience.petitions.some((p) => p.counselorId === id && p.complete),
        )
      )
    case 'deliberation':
      // One round only in v1 (§5.4): every seated counselor has spoken once.
      return seated.every((id) =>
        audience.deliberation.some((e) => e.counselorId === id),
      )
    case 'vote':
      return (
        audience.votes.length > 0 &&
        seated.every((id) => audience.votes.some((v) => v.voterId === id))
      )
    case 'decree':
      return audience.decree !== undefined
    case 'aftermath':
      return false
  }
}

export function audienceReducer(
  state: Audience,
  action: AudienceAction,
): Audience {
  switch (action.type) {
    case 'set-question': {
      if (state.stage !== 'composing') return state
      if (action.question.length > MAX_QUESTION_LENGTH) return state
      return { ...state, question: action.question }
    }

    case 'seat-council': {
      if (state.stage !== 'seating') return state
      if (!isValidCouncil(action.seated)) return state
      return { ...state, seated: [...action.seated] }
    }

    case 'advance': {
      const next = NEXT_STAGE[state.stage]
      if (next === null || !canAdvance(state)) return state
      return { ...state, stage: next }
    }

    case 'petition-chunk': {
      if (state.stage !== 'petition') return state
      if (!state.seated.includes(action.counselorId)) return state

      const existing = state.petitions.find(
        (p) => p.counselorId === action.counselorId,
      )
      if (existing?.complete) return state

      const petitions = existing
        ? state.petitions.map((p) =>
            p.counselorId === action.counselorId
              ? { ...p, text: p.text + action.text }
              : p,
          )
        : [
            ...state.petitions,
            {
              counselorId: action.counselorId,
              text: action.text,
              complete: false,
            },
          ]

      return { ...state, petitions }
    }

    case 'petition-complete': {
      if (state.stage !== 'petition') return state
      if (!state.seated.includes(action.counselorId)) return state

      const exists = state.petitions.some(
        (p) => p.counselorId === action.counselorId,
      )
      const petitions = exists
        ? state.petitions.map((p) =>
            p.counselorId === action.counselorId ? { ...p, complete: true } : p,
          )
        : [
            ...state.petitions,
            { counselorId: action.counselorId, text: '', complete: true },
          ]

      return { ...state, petitions }
    }

    case 'add-exchange': {
      if (state.stage !== 'deliberation') return state
      const { counselorId, targetId } = action.exchange
      if (!state.seated.includes(counselorId)) return state
      // §5.4: a turn must dispute another seated counselor, by name.
      if (!state.seated.includes(targetId)) return state
      if (targetId === counselorId) return state

      return {
        ...state,
        deliberation: [
          ...state.deliberation,
          { ...action.exchange, order: state.deliberation.length },
        ],
      }
    }

    case 'record-votes': {
      if (state.stage !== 'vote') return state
      // §5.5: no self-votes, everyone seated votes exactly once, and every
      // id is seated. Sanitising malformed model output is the AI layer's
      // job (T-12) — by the time it reaches the engine it must be clean.
      if (!isValidTally(action.votes, state.seated)) return state
      return { ...state, votes: [...action.votes] }
    }

    case 'issue-decree': {
      if (state.stage !== 'decree') return state
      const { text, sidedWithId } = action.decree
      if (text.length < 1 || text.length > MAX_DECREE_LENGTH) return state
      if (sidedWithId !== undefined && !state.seated.includes(sidedWithId)) {
        return state
      }
      return { ...state, decree: { ...action.decree } }
    }

    case 'record-reactions': {
      if (state.stage !== 'aftermath') return state
      if (action.reactions.some((r) => !state.seated.includes(r.counselorId))) {
        return state
      }
      return { ...state, reactions: [...action.reactions] }
    }
  }
}

export function isValidQuestion(question: string): boolean {
  const trimmed = question.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_QUESTION_LENGTH
}

export function isValidCouncil(seated: string[]): boolean {
  if (seated.length < MIN_SEATED || seated.length > MAX_SEATED) return false
  return new Set(seated).size === seated.length
}

function isValidTally(votes: Vote[], seated: string[]): boolean {
  if (votes.length !== seated.length) return false
  const voters = new Set(votes.map((v) => v.voterId))
  if (voters.size !== votes.length) return false
  return votes.every(
    (v) =>
      seated.includes(v.voterId) &&
      seated.includes(v.forId) &&
      v.voterId !== v.forId,
  )
}

/** A shuffle source. Injected so the reducer's callers stay deterministic. */
export type Rng = () => number

/**
 * §5.4 speaking order: shuffle, then move every `speaks-last` counselor to
 * the end. Unknown ids are dropped — they can never reach a prompt.
 */
export function resolveSpeakingOrder(
  seated: string[],
  counselors: Readonly<Record<string, Counselor>>,
  rng: Rng = Math.random,
): string[] {
  const known = seated.filter((id) => counselors[id] !== undefined)
  const shuffled = shuffle(known, rng)
  const speaksLast = (id: string) =>
    counselors[id].ability.effect.kind === 'speaks-last'

  return [
    ...shuffled.filter((id) => !speaksLast(id)),
    ...shuffled.filter(speaksLast),
  ]
}

/** Fisher–Yates, driven by the injected rng. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
