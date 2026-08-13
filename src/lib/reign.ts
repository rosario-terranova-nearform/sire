import type { Reaction } from '@/domain/audience'
import type { Reign } from '@/domain/reign'
import { MAX_FAVOR, MIN_FAVOR } from '@/domain/reign'

/**
 * A fresh, empty reign for a chamber to run against.
 *
 * The permanent, favor-accumulating, `localStorage`-backed reign is T-21; until
 * then the chamber (T-17/T-18) still needs *a* `Reign` to feed the prompt
 * builder, which reads `monarchName` and injects favor and decree memory. An
 * empty reign is legal input — no favor, no history — so the court sits without
 * waiting on a persistence layer that has not been built.
 */

/** Placeholder regnal name until the throne room (§8) captures a real one. */
export const DEFAULT_MONARCH_NAME = 'the Sovereign'

export function createDefaultReign(
  monarchName: string = DEFAULT_MONARCH_NAME,
): Reign {
  return {
    id: crypto.randomUUID(),
    monarchName,
    favor: {},
    heardCount: {},
    revealedAgendas: [],
    history: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * §5.7 — apply an aftermath's favor deltas to the reign. Every delta is folded
 * onto the counselor's standing and clamped to the `-10 … +10` band the domain
 * promises. Pure: the caller decides when to persist the result (T-20).
 */
export function applyReactions(reign: Reign, reactions: readonly Reaction[]): Reign {
  if (reactions.length === 0) return reign

  const favor = { ...reign.favor }
  for (const reaction of reactions) {
    const next = (favor[reaction.counselorId] ?? 0) + reaction.favorDelta
    favor[reaction.counselorId] = Math.max(MIN_FAVOR, Math.min(MAX_FAVOR, next))
  }

  return { ...reign, favor }
}
