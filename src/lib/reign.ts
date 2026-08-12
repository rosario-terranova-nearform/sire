import type { Reign } from '@/domain/reign'

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
