import type { SpriteState } from './counselor'

export type Stage =
  | 'composing' // user writing the question
  | 'seating' // user picking the council
  | 'petition' // parallel independent opinions
  | 'deliberation' // sequential argument
  | 'vote' // counselors vote
  | 'decree' // user rules
  | 'aftermath' // counselors react

export interface Petition {
  counselorId: string
  text: string
  /** true once the stream for this counselor has closed */
  complete: boolean
}

export interface Exchange {
  counselorId: string
  /** Who they are rebutting. Enforced non-null by the prompt. */
  targetId: string
  text: string
  order: number
}

export interface Vote {
  voterId: string
  /** Never equal to voterId — enforced in schema validation. */
  forId: string
  /** ≤ 20 words. */
  rationale: string
}

export interface Decree {
  /** The user's own words. Free text, 1–400 chars. */
  text: string
  /** Optional: which counselor the user says they sided with. */
  sidedWithId?: string
  issuedAt: string
}

export interface Reaction {
  counselorId: string
  mood: SpriteState
  /** ≤ 15 words. */
  line: string
  /** -2 … +2, applied to Reign.favor */
  favorDelta: number
}

export interface Audience {
  id: string
  question: string
  seated: string[] // 3–5 counselor ids
  stage: Stage
  petitions: Petition[]
  deliberation: Exchange[]
  votes: Vote[]
  decree?: Decree
  reactions: Reaction[]
  createdAt: string
}

export const STAGES: readonly Stage[] = [
  'composing',
  'seating',
  'petition',
  'deliberation',
  'vote',
  'decree',
  'aftermath',
]

/** §4: the user seats 3–5 counselors per audience. */
export const MIN_SEATED = 3
export const MAX_SEATED = 5

/** §5.1 / §5.6 free-text caps. */
export const MAX_QUESTION_LENGTH = 300
export const MAX_DECREE_LENGTH = 400
