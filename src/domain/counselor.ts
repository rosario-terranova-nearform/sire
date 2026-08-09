export type Faction =
  | 'martial' // war, action, decisive force
  | 'coin' // cost, budget, solvency
  | 'fool' // truth via mockery
  | 'temple' // conscience, principle
  | 'whispers' // second-order consequences, politics
  | 'commons' // who actually bears the cost

export type StatKey = 'candor' | 'prudence' | 'guile'

/** 1–5, rendered as pips on the card. Purely cosmetic EXCEPT where an
 *  ability references a stat. Do not use stats to weight the prompt. */
export type Stats = Record<StatKey, 1 | 2 | 3 | 4 | 5>

export type AbilityEffect =
  | { kind: 'speaks-last' } // Wren
  | { kind: 'licensed-tongue' } // Grin: exempt from all §5.7 favor-degradation effects
  | { kind: 'must-quantify' } // Marrow: every claim gets a number
  | { kind: 'must-cite-precedent' } // Vell
  | { kind: 'reveals-hidden-cost' } // Wren, Hob
  | { kind: 'plain-speech' } // Hob: banned from abstraction
  | { kind: 'reframes-as-campaign' } // Vane

export interface Ability {
  name: string
  /** Card copy, ≤ 90 chars. */
  description: string
  /** Mechanical hook consumed by the prompt builder and the stage engine. */
  effect: AbilityEffect
}

export interface Voice {
  /** e.g. "clipped military imperatives, no hedging" */
  register: string
  /** Recurring verbal habits, 2–4 items. */
  tics: string[]
  /** 2–3 few-shot lines. Critical for voice distinctness. */
  sampleLines: string[]
}

export type SpriteState = 'neutral' | 'pleased' | 'appalled' | 'scheming'

export interface Counselor {
  id: string
  name: string
  /** e.g. "Mistress of Coin" */
  title: string
  faction: Faction
  stats: Stats
  ability: Ability
  /** What they actually want, independent of the user's question.
   *  Hidden in the UI until `Reign.revealedAgendas` includes this id. */
  agenda: string
  voice: Voice
  /** One-line motive summary injected into other counselors' context
   *  during deliberation, so they can attack each other's interests. */
  publicStance: string
  sprite: {
    sheet: string // /sprites/vane.png
    frames: Record<SpriteState, number>
  }
  isCustom: boolean
}

/**
 * A court roster, keyed by counselor id — how every layer above the domain
 * looks a counselor up, including custom ones (T-21) that live outside
 * `src/content/counselors.ts`.
 */
export type CounselorRoster = Readonly<Record<string, Counselor>>

export const FACTIONS: readonly Faction[] = [
  'martial',
  'coin',
  'fool',
  'temple',
  'whispers',
  'commons',
]

export const STAT_KEYS: readonly StatKey[] = ['candor', 'prudence', 'guile']

export const SPRITE_STATES: readonly SpriteState[] = [
  'neutral',
  'pleased',
  'appalled',
  'scheming',
]
