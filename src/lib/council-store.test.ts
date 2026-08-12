import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDefaultCouncil, saveDefaultCouncil } from './council-store'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('council-store', () => {
  it('round-trips a saved council', () => {
    saveDefaultCouncil(['vane', 'marrow', 'grin'])
    expect(loadDefaultCouncil()).toEqual(['vane', 'marrow', 'grin'])
  })

  it('returns nothing on a first, empty visit', () => {
    expect(loadDefaultCouncil()).toEqual([])
  })

  it('recovers from a corrupt store instead of throwing', () => {
    localStorage.setItem('sire:default-council:v1', '{not json')
    expect(loadDefaultCouncil()).toEqual([])
  })

  it('drops ids that no longer exist in the roster', () => {
    saveDefaultCouncil(['vane', 'ghost-of-a-counselor', 'grin'])
    expect(loadDefaultCouncil()).toEqual(['vane', 'grin'])
  })

  it('never returns more than the seating cap', () => {
    saveDefaultCouncil(['vane', 'marrow', 'grin', 'verity', 'wren', 'hob'])
    expect(loadDefaultCouncil()).toHaveLength(5)
  })
})
