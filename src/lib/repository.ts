import { z } from 'zod'
import { MAX_SEATED, type Audience } from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import {
  audienceSchema,
  counselorSchema,
  reignSchema,
} from '@/domain/schemas'
import { createDefaultReign } from './reign'

/**
 * T-21 — the one persistence seam in the app.
 *
 * Everything durable lives behind this interface: the single permanent reign
 * (§3, decision §9), the audiences the chronicle reads (T-23), the custom
 * counselors (§7), and the default council (§5.2). Nothing above this module
 * mentions `localStorage`, so the whole store can become a real database later
 * without a UI file changing (§2).
 *
 * Three invariants hold for every slot:
 *
 * 1. **Versioned.** Each slot is written as `{ version, data }`. Reads run the
 *    payload up through the migration steps for that slot, so an old store is
 *    upgraded rather than discarded. A store written by a *newer* build is left
 *    untouched and read as absent — guessing at a future shape is worse than
 *    starting empty.
 * 2. **Recovering, never throwing.** Corrupt JSON, a payload that fails its
 *    schema, a full or denied store, `localStorage` itself throwing behind a
 *    privacy setting: every one degrades to "nothing saved". A bad write can
 *    never brick the throne room. Unreadable slots are cleared as they are
 *    found, so a corrupt value heals on first read instead of every read.
 * 3. **Per-entry recovery for collections.** One malformed counselor or audience
 *    is dropped on its own; the rest of the list survives.
 */

/** Bump when a persisted shape changes, and add the matching migration step. */
export const SCHEMA_VERSION = 1

const KEYS = {
  reign: 'sire:reign',
  audiences: 'sire:audiences',
  counselors: 'sire:counselors',
  council: 'sire:council',
} as const

/**
 * Pre-repository keys, written by the T-16/T-20 stores this module replaced.
 * Read once, adopted into the versioned slot, then left alone.
 */
const LEGACY_KEYS = {
  reign: 'sire:reign:v1',
  council: 'sire:default-council:v1',
} as const

/** Keep the chronicle bounded; a local store is not an archive. */
export const MAX_STORED_AUDIENCES = 30

/** §4 — the bench is small by design. This is a sanity ceiling, not a game rule. */
export const MAX_CUSTOM_COUNSELORS = 12

/** The slice of `Storage` this module uses — so tests and fallbacks can supply
 *  their own without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface Repository {
  /** The one permanent reign, or null on a first visit. */
  getReign(): Reign | null
  saveReign(reign: Reign): void
  /** Past audiences, newest first. */
  listAudiences(): Audience[]
  /** One audience by id, or null if it is not stored (T-25 resume). */
  getAudience(id: string): Audience | null
  /** Insert or replace by id, newest first, capped. */
  saveAudience(audience: Audience): void
  listCustomCounselors(): Counselor[]
  saveCustomCounselor(counselor: Counselor): void
  deleteCustomCounselor(id: string): void
  /** The council to pre-seat next time (§5.2). Ids only — the caller checks
   *  them against its own roster, which this module knows nothing about. */
  getDefaultCouncil(): string[]
  saveDefaultCouncil(ids: readonly string[]): void
}

/** One version step: takes the payload at version `i`, returns version `i + 1`. */
type Migration = (data: unknown) => unknown

/**
 * Per-slot migration steps, indexed by the version they upgrade *from*.
 *
 * The 0 → 1 steps exist because the T-16/T-20 stores wrote bare, unenveloped
 * payloads: an un-versioned value found in a slot is read as version 0. Those
 * shapes already match today's domain types, so the step is identity — but the
 * ladder is real, and the next shape change appends to it rather than dropping
 * everyone's reign on the floor.
 */
const MIGRATIONS: Record<keyof typeof KEYS, readonly Migration[]> = {
  reign: [(data) => data],
  audiences: [(data) => data],
  counselors: [(data) => data],
  council: [(data) => data],
}

const envelopeSchema = z.object({
  version: z.number().int().nonnegative(),
  data: z.unknown(),
})

const councilSchema = z.array(z.string().min(1))

export function createRepository(storage: StorageLike): Repository {
  /** Read a slot, migrate it, validate it. Anything unreadable is cleared. */
  function read<T>(
    slot: keyof typeof KEYS,
    schema: z.ZodType<T>,
    legacyKey?: string,
  ): T | null {
    const key = KEYS[slot]
    const raw = getRaw(storage, key)

    if (raw === null) {
      return legacyKey === undefined ? null : adopt(slot, schema, legacyKey)
    }

    const decoded = decode(raw, MIGRATIONS[slot])
    if (decoded.ok === false) {
      // A payload from a newer build is left exactly where it is; anything
      // genuinely broken is cleared so the next read starts clean.
      if (decoded.reason !== 'from-the-future') removeRaw(storage, key)
      return null
    }

    const parsed = schema.safeParse(decoded.data)
    if (!parsed.success) {
      removeRaw(storage, key)
      return null
    }
    return parsed.data
  }

  /** Move a pre-repository value into its versioned slot, if it is still good. */
  function adopt<T>(
    slot: keyof typeof KEYS,
    schema: z.ZodType<T>,
    legacyKey: string,
  ): T | null {
    const raw = getRaw(storage, legacyKey)
    if (raw === null) return null

    const decoded = decode(raw, MIGRATIONS[slot])
    if (decoded.ok === false) return null

    const parsed = schema.safeParse(decoded.data)
    if (!parsed.success) return null

    write(slot, parsed.data)
    return parsed.data
  }

  function write(slot: keyof typeof KEYS, data: unknown): void {
    setRaw(
      storage,
      KEYS[slot],
      JSON.stringify({ version: SCHEMA_VERSION, data }),
    )
  }

  /** Read a collection, keeping every entry that survives its own schema. */
  function readEach<T>(slot: keyof typeof KEYS, schema: z.ZodType<T>): T[] {
    const rows = read(slot, z.array(z.unknown()), undefined)
    if (rows === null) return []

    const kept: T[] = []
    for (const row of rows) {
      const parsed = schema.safeParse(row)
      if (parsed.success) kept.push(parsed.data)
    }
    return kept
  }

  return {
    getReign: () => read('reign', reignSchema, LEGACY_KEYS.reign),

    saveReign: (reign) => write('reign', reign),

    listAudiences: () => sortByRecency(readEach('audiences', audienceSchema)),

    getAudience: (id) =>
      readEach('audiences', audienceSchema).find((entry) => entry.id === id) ??
      null,

    saveAudience: (audience) => {
      const rest = readEach('audiences', audienceSchema).filter(
        (entry) => entry.id !== audience.id,
      )
      write(
        'audiences',
        sortByRecency([audience, ...rest]).slice(0, MAX_STORED_AUDIENCES),
      )
    },

    listCustomCounselors: () =>
      readEach('counselors', counselorSchema).slice(0, MAX_CUSTOM_COUNSELORS),

    saveCustomCounselor: (counselor) => {
      const rest = readEach('counselors', counselorSchema).filter(
        (entry) => entry.id !== counselor.id,
      )
      write('counselors', [...rest, counselor].slice(0, MAX_CUSTOM_COUNSELORS))
    },

    deleteCustomCounselor: (id) => {
      write(
        'counselors',
        readEach('counselors', counselorSchema).filter(
          (entry) => entry.id !== id,
        ),
      )
    },

    getDefaultCouncil: () => {
      const ids = read('council', councilSchema, LEGACY_KEYS.council)
      if (ids === null) return []
      return [...new Set(ids)].slice(0, MAX_SEATED)
    },

    saveDefaultCouncil: (ids) =>
      write('council', [...new Set(ids)].slice(0, MAX_SEATED)),
  }
}

type Decoded =
  | { ok: true; data: unknown }
  | { ok: false; reason: 'unreadable' | 'from-the-future' }

/** JSON → envelope → migrated payload. An unenveloped value is version 0. */
function decode(raw: string, migrations: readonly Migration[]): Decoded {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }

  const envelope = envelopeSchema.safeParse(parsed)
  const version = envelope.success ? envelope.data.version : 0
  const data = envelope.success ? envelope.data.data : parsed

  if (version > SCHEMA_VERSION) return { ok: false, reason: 'from-the-future' }

  let migrated = data
  for (let from = version; from < SCHEMA_VERSION; from++) {
    const step = migrations[from]
    if (step === undefined) return { ok: false, reason: 'unreadable' }
    migrated = step(migrated)
  }
  return { ok: true, data: migrated }
}

function sortByRecency<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/* --------------------------------------------------------------- storage I/O */

function getRaw(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function setRaw(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    // A denied or full store must never break a ruling. Losing the write is an
    // acceptable degradation; throwing at decree time is not.
  }
}

function removeRaw(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Nothing to do — the read already degraded to "nothing saved".
  }
}

/** A store for when there is no `localStorage`: SSR, a test, a locked-down
 *  browser. Same contract, forgets everything on reload. */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

function resolveStorage(): StorageLike {
  try {
    // Touching `localStorage` at all throws in some privacy modes, so the probe
    // is part of resolving it, not a separate check.
    const probe = '__sire_probe__'
    globalThis.localStorage.setItem(probe, '1')
    globalThis.localStorage.removeItem(probe)
    return globalThis.localStorage
  } catch {
    return createMemoryStorage()
  }
}

/** The app's repository. The only `localStorage` binding in the codebase. */
export const repository: Repository = createRepository(resolveStorage())

/**
 * The reign to run against: the persisted one if it survives validation, else a
 * fresh default persisted immediately so the next visit finds it.
 */
export function getOrCreateReign(
  monarchName?: string,
  repo: Repository = repository,
): Reign {
  const existing = repo.getReign()
  if (existing !== null) return existing

  const created = createDefaultReign(monarchName)
  repo.saveReign(created)
  return created
}
