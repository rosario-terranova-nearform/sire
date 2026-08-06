/** Exactly one Reign persists per browser. No reset/switch flow in v1. */
export interface Reign {
  id: string
  /** User-chosen regnal name, e.g. "Rosario the Unbothered" */
  monarchName: string
  /** counselorId -> favor, clamped -10 … +10 */
  favor: Record<string, number>
  /** counselorId -> how many times they have spoken across all audiences */
  heardCount: Record<string, number>
  /** Agendas unlocked at heardCount >= 3 */
  revealedAgendas: string[]
  /** Last 10 decrees, injected as memory into later prompts. */
  history: Array<{ question: string; decree: string; at: string }>
  createdAt: string
}

/** §3: favor is clamped to this range wherever a delta is applied. */
export const MIN_FAVOR = -10
export const MAX_FAVOR = 10

/** §3: only the last N decrees are carried as prompt memory. */
export const MAX_HISTORY = 10

/** §5.7 favor thresholds. */
export const FAVOR_TERSE_AT = -5
export const FAVOR_ABSENT_AT = -8
export const FAVOR_GENEROUS_AT = 7

/** T-23: an agenda unlocks once a counselor has spoken this many times. */
export const AGENDA_REVEAL_AT = 3
