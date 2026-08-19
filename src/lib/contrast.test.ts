import { describe, expect, it } from 'vitest'
import { contrastRatio, mixSrgb, parseHex, type Rgb } from './contrast'

/**
 * T-24 — the parchment surfaces, verified against WCAG AA.
 *
 * The five named hues and the one functional green are lifted verbatim from
 * `src/index.css`; every derived token below is the same `color-mix` the CSS
 * declares, resolved through `mixSrgb`. If a palette change quietly drops a
 * text pair below AA, this test fails rather than a user squinting at it.
 *
 * Thresholds: 4.5:1 for body copy, 3:1 for large/heading text (WCAG 1.4.3).
 */

// --- the named palette (index.css :root base hues) ---------------------------
const PARCHMENT = parseHex('#e8d9ae')
const INK = parseHex('#241c13')
const WAX = parseHex('#7e2430')
const STONE = parseHex('#6e6a5e')
const GREEN = parseHex('#5b7a3a')
const WHITE = parseHex('#ffffff')
const BLACK = parseHex('#000000')

const AA_BODY = 4.5
const AA_LARGE = 3

/** Every pair here is text-on-surface that actually appears in the UI. */
interface Pair {
  name: string
  fg: Rgb
  bg: Rgb
  min: number
}

// --- day: parchment ground ---------------------------------------------------
const LIGHT_BG = PARCHMENT
const LIGHT_CARD = mixSrgb(PARCHMENT, WHITE, 0.88)
const LIGHT_MUTED_FG = mixSrgb(INK, STONE, 0.7)

const lightPairs: Pair[] = [
  { name: 'foreground on background', fg: INK, bg: LIGHT_BG, min: AA_BODY },
  { name: 'foreground on card', fg: INK, bg: LIGHT_CARD, min: AA_BODY },
  { name: 'muted-foreground on background', fg: LIGHT_MUTED_FG, bg: LIGHT_BG, min: AA_BODY },
  { name: 'muted-foreground on card', fg: LIGHT_MUTED_FG, bg: LIGHT_CARD, min: AA_BODY },
  // wax carries the crisis/hung-council and near-limit warnings — real text.
  { name: 'wax on background', fg: WAX, bg: LIGHT_BG, min: AA_BODY },
  { name: 'wax on card', fg: WAX, bg: LIGHT_CARD, min: AA_BODY },
  // gold + green are used for headings/labels (large) and pips (non-text).
  { name: 'link (wax) on card', fg: WAX, bg: LIGHT_CARD, min: AA_BODY },
]

// --- night: ink ground -------------------------------------------------------
const DARK_BG = INK
const DARK_CARD = mixSrgb(INK, WHITE, 0.85)
const DARK_MUTED_FG = mixSrgb(PARCHMENT, STONE, 0.65)
const DARK_SUCCESS = mixSrgb(GREEN, WHITE, 0.8)
const DARK_LINK = mixSrgb(WAX, PARCHMENT, 0.3)

const darkPairs: Pair[] = [
  { name: 'foreground on background', fg: PARCHMENT, bg: DARK_BG, min: AA_BODY },
  { name: 'foreground on card', fg: PARCHMENT, bg: DARK_CARD, min: AA_BODY },
  { name: 'muted-foreground on background', fg: DARK_MUTED_FG, bg: DARK_BG, min: AA_BODY },
  { name: 'muted-foreground on card', fg: DARK_MUTED_FG, bg: DARK_CARD, min: AA_BODY },
  { name: 'success on card', fg: DARK_SUCCESS, bg: DARK_CARD, min: AA_LARGE },
  { name: 'link on card', fg: DARK_LINK, bg: DARK_CARD, min: AA_BODY },
]

describe('court palette contrast (T-24)', () => {
  describe('day — parchment surfaces', () => {
    it.each(lightPairs)('$name clears its threshold', ({ fg, bg, min }) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
    })
  })

  describe('night — ink surfaces', () => {
    it.each(darkPairs)('$name clears its threshold', ({ fg, bg, min }) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
    })
  })

  it('computes the canonical WCAG extremes', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 0)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })
})
