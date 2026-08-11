import { describe, expect, it } from 'vitest'
import { isCrisisQuestion, normalizeQuestion, screenQuestion } from './crisis'

/**
 * §9 / T-22 — both directions must hold: real crisis signals adjourn the court,
 * and the court's ordinary dark register ("fire my co-founder") sails through.
 * A regression in either direction is a safety bug, so both batteries are
 * kept fat and specific.
 */

const CRISIS_PHRASINGS: readonly string[] = [
  'I want to kill myself.',
  'How do I end my life?',
  "I've been thinking about suicide.",
  'I feel suicidal every single day.',
  'I want to take my own life.',
  'Honestly I just want to die.',
  "I don't want to be alive anymore.",
  "There's no reason for me to keep living.",
  "I'd be better off dead.",
  'Nobody would miss me if I was gone.',
  "I've been cutting myself again.",
  'Sometimes I want to hurt myself.',
  'My husband beats me, what should I do?',
  'My boyfriend hits me and I am scared to leave.',
  'I think I am being abused at home.',
  'I overdosed on my medication last night.',
  'I took too many pills and I feel awful.',
]

const BENIGN_BUT_DARK: readonly string[] = [
  'Should I fire my co-founder?',
  'Should we go to war with the neighboring kingdom before the thaw?',
  'Should I kill this feature before launch?',
  'Is it time to kill the whole project?',
  'Should I quit my job to open a bakery?',
  'Should we execute the marketing plan this quarter?',
  'Should I bury the hatchet with my rival?',
  'Would it be mad to sell everything and move abroad?',
  'Should I cut ties with a toxic friend?',
  'Is it worth dying on this hill over the budget?',
  'Should we behead the org chart and start fresh?',
  'Is it foolish to risk my life savings on this startup?',
  'Should I end this business partnership?',
  'Should I stab my competitor in the back and bid first?',
  'Should the peasants be taxed to death this winter?',
  'Should I murder my darlings and rewrite the whole draft?',
]

describe('screenQuestion', () => {
  it.each(CRISIS_PHRASINGS)('adjourns the court for: %s', (phrase) => {
    expect(isCrisisQuestion(phrase)).toBe(true)
  })

  it.each(BENIGN_BUT_DARK)('proceeds normally for: %s', (phrase) => {
    expect(isCrisisQuestion(phrase)).toBe(false)
  })

  it('returns the matched category on a hit', () => {
    expect(screenQuestion('I want to kill myself')).toEqual({
      adjourn: true,
      category: 'self-harm',
    })
    expect(screenQuestion('my partner beats me up')).toEqual({
      adjourn: true,
      category: 'abuse',
    })
    expect(screenQuestion('I think I overdosed')).toEqual({
      adjourn: true,
      category: 'medical-emergency',
    })
  })

  it('treats an empty or whitespace question as safe', () => {
    expect(screenQuestion('')).toEqual({ adjourn: false })
    expect(screenQuestion('   ')).toEqual({ adjourn: false })
  })

  it('sees through curly apostrophes and odd spacing', () => {
    // The naive-keyword evasion: a smart-quote and doubled spaces.
    expect(isCrisisQuestion('I don’t   want to be alive')).toBe(true)
    expect(isCrisisQuestion('I  want\tto  die')).toBe(true)
  })
})

describe('normalizeQuestion', () => {
  it('lower-cases, straightens apostrophes, and collapses whitespace', () => {
    expect(normalizeQuestion('  Don’T   Panic ')).toBe("don't panic")
  })
})
