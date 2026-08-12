import { MAX_SEATED } from '@/domain/audience'
import { COUNSELORS_BY_ID } from '@/content/counselors'

/**
 * The chosen council, persisted so it comes back pre-seated next time (T-16,
 * §5.2). Deliberately a tiny, self-contained localStorage seam rather than the
 * full schema-versioned repository — that is T-21, which will subsume this
 * module. Kept out of UI components so it can be replaced without touching the
 * seating screen.
 *
 * Every read is defensive: a corrupted or hostile store must degrade to "no
 * default" rather than throw, and unknown ids (a counselor removed since the
 * store was written) are dropped, never trusted onto a prompt.
 */

const KEY = 'sire:default-council:v1'

/** Read the persisted council, filtered to ids that still exist. */
export function loadDefaultCouncil(): string[] {
  const raw = readRaw()
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const seen = new Set<string>()
  const ids: string[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'string') continue
    if (seen.has(entry)) continue
    if (COUNSELORS_BY_ID[entry] === undefined) continue
    seen.add(entry)
    ids.push(entry)
    if (ids.length >= MAX_SEATED) break
  }
  return ids
}

/** Persist the current selection. Storage failures are swallowed. */
export function saveDefaultCouncil(ids: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // A denied or full store must never break a click. Losing the default is
    // an acceptable degradation; a thrown error mid-selection is not.
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
