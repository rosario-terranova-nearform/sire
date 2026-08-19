import { beforeEach, describe, expect, it } from 'vitest'
import type { Audience } from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'
import { COUNSELORS } from '@/content/counselors'
import { createAudience } from '@/engine/audience-machine'
import {
  MAX_CUSTOM_COUNSELORS,
  SCHEMA_VERSION,
  createMemoryStorage,
  createRepository,
  getOrCreateReign,
  type Repository,
  type StorageLike,
} from './repository'
import { createDefaultReign } from './reign'

let storage: StorageLike
let repo: Repository

beforeEach(() => {
  storage = createMemoryStorage()
  repo = createRepository(storage)
})

function envelope(data: unknown, version = SCHEMA_VERSION): string {
  return JSON.stringify({ version, data })
}

function audience(id: string, createdAt: string): Audience {
  return createAudience({
    id,
    createdAt,
    question: 'Should we march on Harrow before the thaw?',
    seated: ['vane', 'marrow', 'grin'],
  })
}

function customCounselor(id = 'custom-ashvane'): Counselor {
  return { ...COUNSELORS[1], id, name: 'Keeper Ashvane', isCustom: true }
}

describe('repository — the reign (T-21)', () => {
  it('round-trips a saved reign', () => {
    const reign = { ...createDefaultReign('Rosario the Unbothered'), favor: { vane: 3 } }
    repo.saveReign(reign)
    expect(repo.getReign()).toEqual(reign)
  })

  it('returns null on a first, empty visit', () => {
    expect(repo.getReign()).toBeNull()
  })

  it('creates and persists a default when none exists', () => {
    const created = getOrCreateReign('Rosario the Unbothered', repo)
    expect(created.monarchName).toBe('Rosario the Unbothered')
    expect(repo.getReign()).toEqual(created)
  })

  it('prefers the persisted reign over a fresh default', () => {
    const saved = { ...createDefaultReign(), favor: { hob: 5 } }
    repo.saveReign(saved)
    expect(getOrCreateReign(undefined, repo)).toEqual(saved)
  })
})

describe('repository — audiences (T-21)', () => {
  it('round-trips an audience', () => {
    const one = audience('aud-1', '2026-08-12T10:00:00.000Z')
    repo.saveAudience(one)
    expect(repo.listAudiences()).toEqual([one])
  })

  it('lists newest first', () => {
    repo.saveAudience(audience('older', '2026-08-01T00:00:00.000Z'))
    repo.saveAudience(audience('newer', '2026-08-14T00:00:00.000Z'))

    expect(repo.listAudiences().map((entry) => entry.id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('replaces an audience saved twice rather than duplicating it', () => {
    const first = audience('aud-1', '2026-08-12T10:00:00.000Z')
    repo.saveAudience(first)
    repo.saveAudience({ ...first, question: 'Should we sue for peace?' })

    const stored = repo.listAudiences()
    expect(stored).toHaveLength(1)
    expect(stored[0].question).toBe('Should we sue for peace?')
  })

  it('keeps every good audience when one stored entry is malformed', () => {
    const good = audience('good', '2026-08-12T10:00:00.000Z')
    storage.setItem(
      'sire:audiences',
      envelope([good, { id: 'broken', stage: 'nonsense' }]),
    )

    expect(repo.listAudiences().map((entry) => entry.id)).toEqual(['good'])
  })

  // T-25 — resume reads one audience back by id.
  it('gets a stored audience by id, and null for an unknown one', () => {
    const one = audience('aud-1', '2026-08-12T10:00:00.000Z')
    repo.saveAudience(one)

    expect(repo.getAudience('aud-1')).toEqual(one)
    expect(repo.getAudience('never-held')).toBeNull()
  })
})

describe('repository — custom counselors (T-21)', () => {
  it('round-trips a custom counselor', () => {
    const counselor = customCounselor()
    repo.saveCustomCounselor(counselor)
    expect(repo.listCustomCounselors()).toEqual([counselor])
  })

  it('replaces by id, so an edit does not double the seat', () => {
    repo.saveCustomCounselor(customCounselor())
    repo.saveCustomCounselor({
      ...customCounselor(),
      title: 'Warden of the Locks',
    })

    const stored = repo.listCustomCounselors()
    expect(stored).toHaveLength(1)
    expect(stored[0].title).toBe('Warden of the Locks')
  })

  it('dismisses one without touching the others', () => {
    repo.saveCustomCounselor(customCounselor('custom-a'))
    repo.saveCustomCounselor(customCounselor('custom-b'))
    repo.deleteCustomCounselor('custom-a')

    expect(repo.listCustomCounselors().map((c) => c.id)).toEqual(['custom-b'])
  })

  it('caps the bench', () => {
    for (let n = 0; n < MAX_CUSTOM_COUNSELORS + 4; n++) {
      repo.saveCustomCounselor(customCounselor(`custom-${n}`))
    }
    expect(repo.listCustomCounselors()).toHaveLength(MAX_CUSTOM_COUNSELORS)
  })

  it('drops a single unparseable counselor and keeps the rest', () => {
    storage.setItem(
      'sire:counselors',
      envelope([customCounselor(), { id: 'half-a-counselor' }]),
    )
    expect(repo.listCustomCounselors().map((c) => c.id)).toEqual([
      'custom-ashvane',
    ])
  })
})

describe('repository — the default council (T-21)', () => {
  it('round-trips a council', () => {
    repo.saveDefaultCouncil(['vane', 'marrow', 'grin'])
    expect(repo.getDefaultCouncil()).toEqual(['vane', 'marrow', 'grin'])
  })

  it('returns nothing on a first, empty visit', () => {
    expect(repo.getDefaultCouncil()).toEqual([])
  })

  it('never returns more than the seating cap', () => {
    repo.saveDefaultCouncil(['vane', 'marrow', 'grin', 'verity', 'wren', 'hob'])
    expect(repo.getDefaultCouncil()).toHaveLength(5)
  })

  it('drops duplicates', () => {
    repo.saveDefaultCouncil(['vane', 'vane', 'grin'])
    expect(repo.getDefaultCouncil()).toEqual(['vane', 'grin'])
  })
})

describe('repository — corruption recovery (T-21)', () => {
  it('recovers from unparseable JSON in every slot', () => {
    for (const key of [
      'sire:reign',
      'sire:audiences',
      'sire:counselors',
      'sire:council',
    ]) {
      storage.setItem(key, '{not json')
    }

    expect(repo.getReign()).toBeNull()
    expect(repo.listAudiences()).toEqual([])
    expect(repo.listCustomCounselors()).toEqual([])
    expect(repo.getDefaultCouncil()).toEqual([])
  })

  it('recovers from a structurally invalid reign', () => {
    storage.setItem('sire:reign', envelope({ id: 'x' }))
    expect(repo.getReign()).toBeNull()
  })

  it('clears a corrupt slot as it reads it, so it heals on the next write', () => {
    storage.setItem('sire:reign', '{not json')
    expect(repo.getReign()).toBeNull()
    expect(storage.getItem('sire:reign')).toBeNull()

    const reign = createDefaultReign()
    repo.saveReign(reign)
    expect(repo.getReign()).toEqual(reign)
  })

  it('leaves a store written by a newer build exactly where it is', () => {
    const future = envelope({ anything: true }, SCHEMA_VERSION + 1)
    storage.setItem('sire:reign', future)

    expect(repo.getReign()).toBeNull()
    // Not cleared: a later build that understands the shape must still find it.
    expect(storage.getItem('sire:reign')).toBe(future)
  })

  it('survives a storage that throws on every operation', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const denied = createRepository(hostile)

    expect(() => denied.saveReign(createDefaultReign())).not.toThrow()
    expect(denied.getReign()).toBeNull()
    expect(denied.listAudiences()).toEqual([])
    expect(denied.getDefaultCouncil()).toEqual([])
  })
})

describe('repository — schema versioning (T-21)', () => {
  it('writes every slot under the current schema version', () => {
    repo.saveReign(createDefaultReign())
    const raw = JSON.parse(storage.getItem('sire:reign') ?? 'null')
    expect(raw).toMatchObject({ version: SCHEMA_VERSION })
  })

  it('adopts the pre-repository reign written by T-20', () => {
    const legacy = { ...createDefaultReign('Rosario the Unbothered'), favor: { wren: -2 } }
    // The old store wrote a bare, unenveloped payload under its own key.
    storage.setItem('sire:reign:v1', JSON.stringify(legacy))

    expect(repo.getReign()).toEqual(legacy)
    // …and migrates it into the versioned slot, so the next read is direct.
    expect(JSON.parse(storage.getItem('sire:reign') ?? 'null')).toEqual({
      version: SCHEMA_VERSION,
      data: legacy,
    })
  })

  it('adopts the pre-repository default council written by T-16', () => {
    storage.setItem(
      'sire:default-council:v1',
      JSON.stringify(['vane', 'grin', 'hob']),
    )
    expect(repo.getDefaultCouncil()).toEqual(['vane', 'grin', 'hob'])
  })

  it('ignores a legacy value that no longer validates', () => {
    storage.setItem('sire:reign:v1', JSON.stringify({ id: 'x' }))
    expect(repo.getReign()).toBeNull()
  })
})

describe('the repository is the only storage seam (T-21)', () => {
  it('is the sole module in src/ that touches localStorage', () => {
    // Read through Vite rather than `node:fs`, so the app's own tsconfig stays
    // free of node types.
    const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    const offenders = Object.entries(sources)
      .filter(([path]) => {
        // Tests may reach for the real store to set up a fixture; app code must
        // not (T-21: no `localStorage` leaking into UI code).
        if (/\.test\.tsx?$/.test(path)) return false
        return path !== '/src/lib/repository.ts'
      })
      // Member access, not prose: several modules *mention* `localStorage` in a
      // comment to explain that they deliberately never touch it.
      .filter(([, source]) => /\blocalStorage\s*[.[]/.test(source))
      .map(([path]) => path)

    expect(offenders).toEqual([])
    // A glob that matched nothing would pass vacuously.
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })
})
