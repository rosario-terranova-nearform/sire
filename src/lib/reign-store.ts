import type { Reign } from '@/domain/reign'
import { reignSchema } from '@/domain/schemas'
import { createDefaultReign } from './reign'

/**
 * The one permanent reign per browser (§3, decision #9), persisted so favor and
 * decree memory survive a reload (T-20).
 *
 * Deliberately a tiny, self-contained localStorage seam rather than the full
 * schema-versioned repository — that is T-21, which will subsume this module
 * exactly as it will `council-store`. Kept out of UI components so it can be
 * swapped without touching the chamber.
 *
 * Every read is defensive: a corrupted or hostile store degrades to "no reign"
 * rather than throwing, so a bad write can never brick the throne room.
 */

const KEY = 'sire:reign:v1'

/** Read the persisted reign, or null if there is none or it is unreadable. */
export function loadReign(): Reign | null {
  const raw = readRaw()
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const result = reignSchema.safeParse(parsed)
  return result.success ? result.data : null
}

/** Persist the reign. Storage failures are swallowed, never thrown. */
export function saveReign(reign: Reign): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(reign))
  } catch {
    // A denied or full store must never break a ruling. Losing the persisted
    // favor is an acceptable degradation; a thrown error at decree time is not.
  }
}

/**
 * The reign to run a chamber against: the persisted one if it survives
 * validation, otherwise a fresh default that is persisted immediately so the
 * next visit finds it.
 */
export function loadOrCreateReign(monarchName?: string): Reign {
  const existing = loadReign()
  if (existing !== null) return existing

  const created = createDefaultReign(monarchName)
  saveReign(created)
  return created
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
