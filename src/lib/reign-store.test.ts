import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultReign } from './reign'
import { loadOrCreateReign, loadReign, saveReign } from './reign-store'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('reign-store (T-20)', () => {
  it('round-trips a saved reign', () => {
    const reign = { ...createDefaultReign('Rosario the Unbothered'), favor: { vane: 3 } }
    saveReign(reign)
    expect(loadReign()).toEqual(reign)
  })

  it('returns null on a first, empty visit', () => {
    expect(loadReign()).toBeNull()
  })

  it('recovers from a corrupt store instead of throwing', () => {
    localStorage.setItem('sire:reign:v1', '{not json')
    expect(loadReign()).toBeNull()
  })

  it('rejects a structurally invalid reign', () => {
    localStorage.setItem('sire:reign:v1', JSON.stringify({ id: 'x' }))
    expect(loadReign()).toBeNull()
  })

  it('creates and persists a default when none exists', () => {
    const created = loadOrCreateReign('Rosario the Unbothered')
    expect(created.monarchName).toBe('Rosario the Unbothered')
    // The next visit finds the very reign it just wrote.
    expect(loadReign()).toEqual(created)
  })

  it('returns the persisted reign over a fresh default', () => {
    const saved = { ...createDefaultReign(), favor: { hob: 5 } }
    saveReign(saved)
    expect(loadOrCreateReign()).toEqual(saved)
  })
})
