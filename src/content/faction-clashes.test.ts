import { describe, expect, it } from 'vitest'
import { clashHints } from './faction-clashes'
import { COUNSELORS_BY_ID } from './counselors'

const pick = (...ids: string[]) => ids.map((id) => COUNSELORS_BY_ID[id])

describe('clashHints', () => {
  it('fires the martial/coin clash when both are seated', () => {
    const hints = clashHints(pick('vane', 'marrow', 'grin'))
    expect(hints.some((h) => /will not agree — good/i.test(h))).toBe(true)
  })

  it('names the actual seated counselors by title', () => {
    const hints = clashHints(pick('vane', 'marrow'))
    expect(hints[0]).toContain('Marshal of the Host')
    expect(hints[0]).toContain('Mistress of Coin')
  })

  it('stays silent when no declared rivalry is at the table', () => {
    // Whispers + temple share no declared clash.
    expect(clashHints(pick('wren', 'verity'))).toEqual([])
  })

  it('surfaces every distinct active clash', () => {
    // Marshal clashes with both coin and commons; two hints.
    const hints = clashHints(pick('vane', 'marrow', 'hob'))
    expect(hints.length).toBeGreaterThanOrEqual(2)
  })
})
