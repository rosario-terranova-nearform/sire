import { describe, expect, it } from 'vitest'
import { COUNSELORS } from '@/content/counselors'
import { MAX_SEATED } from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'
import { buildRoster, filterKnownSeated } from './roster'

const custom = (id: string, overrides: Partial<Counselor> = {}): Counselor => ({
  ...COUNSELORS[0],
  id,
  name: `Custom ${id}`,
  isCustom: true,
  ...overrides,
})

describe('buildRoster (T-21)', () => {
  it('is the seed council when nothing has been invented', () => {
    const { counselors, byId } = buildRoster()
    expect(counselors).toEqual(COUNSELORS)
    expect(byId.vane).toBe(COUNSELORS[0])
  })

  it('appends custom counselors after the seed council', () => {
    const mine = custom('custom-ashvane')
    const { counselors, byId } = buildRoster([mine])

    expect(counselors).toHaveLength(COUNSELORS.length + 1)
    expect(counselors.at(-1)).toBe(mine)
    expect(byId['custom-ashvane']).toBe(mine)
  })

  it('refuses to let a stored counselor shadow a seed id', () => {
    // A hostile or stale store must not be able to redefine Grin's licensed
    // tongue (§5.7) or Wren's speaks-last ordering (§5.4).
    const impostor = custom('grin', {
      ability: {
        name: 'Nothing',
        description: 'Nothing at all.',
        effect: { kind: 'speaks-last' },
      },
    })
    const { counselors, byId } = buildRoster([impostor])

    expect(counselors).toHaveLength(COUNSELORS.length)
    expect(byId.grin.ability.effect).toEqual({ kind: 'licensed-tongue' })
  })

  it('keeps only the first of two custom counselors sharing an id', () => {
    const first = custom('custom-a', { name: 'First' })
    const second = custom('custom-a', { name: 'Second' })
    expect(buildRoster([first, second]).byId['custom-a'].name).toBe('First')
  })
})

describe('filterKnownSeated (T-21)', () => {
  it('drops ids that no longer resolve', () => {
    const { byId } = buildRoster()
    expect(filterKnownSeated(['vane', 'ghost-of-a-counselor', 'grin'], byId)).toEqual([
      'vane',
      'grin',
    ])
  })

  it('keeps a custom counselor that is still in the court', () => {
    const mine = custom('custom-ashvane')
    const { byId } = buildRoster([mine])
    expect(filterKnownSeated(['vane', 'custom-ashvane'], byId)).toEqual([
      'vane',
      'custom-ashvane',
    ])
  })

  it('drops duplicates and never exceeds the seating cap', () => {
    const { byId } = buildRoster()
    expect(filterKnownSeated(['vane', 'vane'], byId)).toEqual(['vane'])
    expect(
      filterKnownSeated(
        COUNSELORS.map((counselor) => counselor.id),
        byId,
      ),
    ).toHaveLength(MAX_SEATED)
  })
})
