import { describe, expect, it } from 'vitest'
import { EXAMPLE_QUESTIONS } from './example-questions'
import { MAX_QUESTION_LENGTH } from '@/domain/audience'
import { isValidQuestion } from '@/engine/audience-machine'
import { isCrisisQuestion } from '@/lib/crisis'

describe('EXAMPLE_QUESTIONS', () => {
  it('offers a handful of prompts', () => {
    expect(EXAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('every example is a legal, submittable question', () => {
    for (const example of EXAMPLE_QUESTIONS) {
      expect(isValidQuestion(example)).toBe(true)
      expect(example.length).toBeLessThanOrEqual(MAX_QUESTION_LENGTH)
    }
  })

  it('no example trips the crisis screen (§9)', () => {
    // A first-time monarch clicks these without reading them — none may adjourn.
    for (const example of EXAMPLE_QUESTIONS) {
      expect(isCrisisQuestion(example)).toBe(false)
    }
  })
})
