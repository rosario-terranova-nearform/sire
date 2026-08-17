import { MAX_SEATED } from '@/domain/audience'
import type { Counselor, CounselorRoster } from '@/domain/counselor'
import { COUNSELORS } from '@/content/counselors'

/**
 * T-21 — the court as the app actually sees it: the six seed counselors (§4)
 * plus whatever the monarch has invented.
 *
 * Every layer above the domain already takes an injectable roster
 * (`useChamber`, the prompt builder, the stage components, `calls.ts`), so
 * custom counselors reach a prompt by being in *this* object rather than by any
 * of those layers learning about them.
 *
 * Seed content wins every collision. A stored counselor that shadows a seed id
 * is dropped, not merged: a bad or hostile store must not be able to redefine
 * Grin's licensed tongue (§5.7) or Wren's speaks-last ordering (§5.4).
 */

export interface Roster {
  /** Display order: the seed council first, then custom seats as added. */
  counselors: readonly Counselor[]
  byId: CounselorRoster
}

export function buildRoster(custom: readonly Counselor[] = []): Roster {
  const seedIds = new Set(COUNSELORS.map((counselor) => counselor.id))
  const seen = new Set(seedIds)

  const extras: Counselor[] = []
  for (const counselor of custom) {
    if (seen.has(counselor.id)) continue
    seen.add(counselor.id)
    extras.push(counselor)
  }

  const counselors = [...COUNSELORS, ...extras]
  return {
    counselors,
    byId: Object.fromEntries(counselors.map((c) => [c.id, c])),
  }
}

/**
 * The persisted default council (§5.2), filtered to seats that still exist: a
 * counselor dismissed from the court since the store was written is dropped, so
 * an id that no longer resolves can never reach a prompt.
 */
export function filterKnownSeated(
  ids: readonly string[],
  roster: CounselorRoster,
): string[] {
  const kept: string[] = []
  for (const id of ids) {
    if (roster[id] === undefined) continue
    if (kept.includes(id)) continue
    kept.push(id)
    if (kept.length >= MAX_SEATED) break
  }
  return kept
}
