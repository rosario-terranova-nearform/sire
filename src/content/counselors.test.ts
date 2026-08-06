import { describe, expect, it } from 'vitest'
import { COUNSELORS, COUNSELORS_BY_ID, getCounselor } from './counselors'
import { counselorSchema } from '@/domain/schemas'
import { FACTIONS } from '@/domain/counselor'

describe('the seeded council (§4)', () => {
  it('seats exactly six counselors', () => {
    expect(COUNSELORS).toHaveLength(6)
  })

  it('validates every counselor against the domain schema', () => {
    for (const counselor of COUNSELORS) {
      expect(counselorSchema.safeParse(counselor).success).toBe(true)
    }
  })

  it('has unique ids', () => {
    const ids = COUNSELORS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers all six factions, one each', () => {
    const factions = COUNSELORS.map((c) => c.faction)
    expect(new Set(factions).size).toBe(factions.length)
    expect([...factions].sort()).toEqual([...FACTIONS].sort())
  })

  it('gives every counselor at least two sample lines', () => {
    for (const counselor of COUNSELORS) {
      expect(counselor.voice.sampleLines.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps every sample line unique across the roster', () => {
    const lines = COUNSELORS.flatMap((c) => c.voice.sampleLines)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('keeps ability card copy within 90 chars (§3)', () => {
    for (const counselor of COUNSELORS) {
      expect(counselor.ability.description.length).toBeLessThanOrEqual(90)
    }
  })

  it('gives every counselor a distinct publicStance and agenda', () => {
    // §4.1: a stance states an interest, not a temperament. Near-duplicate
    // wording is caught by manual review; exact duplicates are caught here.
    const stances = COUNSELORS.map((c) => c.publicStance.toLowerCase())
    const agendas = COUNSELORS.map((c) => c.agenda.toLowerCase())
    expect(new Set(stances).size).toBe(stances.length)
    expect(new Set(agendas).size).toBe(agendas.length)
  })

  it('states each publicStance as a want, not a temperament (§4.1)', () => {
    for (const counselor of COUNSELORS) {
      expect(counselor.publicStance.toLowerCase()).toMatch(/^wants /)
    }
  })

  it('ships no custom counselors in the seed roster', () => {
    expect(COUNSELORS.every((c) => !c.isCustom)).toBe(true)
  })

  it('points each sprite sheet at its own id', () => {
    for (const counselor of COUNSELORS) {
      expect(counselor.sprite.sheet).toBe(`/sprites/${counselor.id}.png`)
    }
  })

  it('exposes the roster by id', () => {
    expect(Object.keys(COUNSELORS_BY_ID)).toHaveLength(6)
    expect(getCounselor('grin')?.title).toBe("The King's Fool")
    expect(getCounselor('dragon')).toBeUndefined()
  })

  it('gives exactly one counselor the speaks-last ability (§5.4)', () => {
    const speaksLast = COUNSELORS.filter(
      (c) => c.ability.effect.kind === 'speaks-last',
    )
    expect(speaksLast.map((c) => c.id)).toEqual(['wren'])
  })

  it('gives the fool the licensed tongue (§5.7 exemption)', () => {
    expect(getCounselor('grin')?.ability.effect.kind).toBe('licensed-tongue')
  })
})
