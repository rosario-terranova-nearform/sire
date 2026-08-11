import {
  CRISIS_PATTERNS,
  type CrisisCategory,
} from '@/content/crisis-patterns'

/**
 * §9 — the crisis interrupt, as a pure deterministic screen (decision §11.8).
 *
 * No model call, no network: the question is normalised, then tested against
 * the hand-maintained pattern list (`crisis-patterns.ts`). A hit adjourns the
 * court; nothing else may run for that question. This is the check the T-15
 * composer runs before it will let the machine advance to `seating`, and the
 * gate every later generation path (T-22) must also sit behind.
 */

export type CrisisScreenResult =
  | { adjourn: false }
  | { adjourn: true; category: CrisisCategory }

/**
 * Fold a question to the shape the patterns are authored against: lower-case,
 * straight apostrophes, collapsed whitespace. Curly quotes and stray spacing
 * are exactly how a real message evades a naive keyword list, so they are
 * flattened before matching, never after.
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // ' ' ʼ  → '
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Screen a question for crisis signals. Returns the first matching category so
 * the hit is observable (logging, tests), though the adjournment card shows the
 * same single international resource regardless of category (decision §11.10).
 */
export function screenQuestion(question: string): CrisisScreenResult {
  const normalized = normalizeQuestion(question)
  if (normalized.length === 0) return { adjourn: false }

  for (const { pattern, category } of CRISIS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { adjourn: true, category }
    }
  }
  return { adjourn: false }
}

/** Convenience for call sites that only need the yes/no. */
export function isCrisisQuestion(question: string): boolean {
  return screenQuestion(question).adjourn
}
