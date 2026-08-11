/**
 * §9 — the crisis interrupt's static, hand-maintained pattern list.
 *
 * This is the whole classifier: deterministic regexes, no model call (decision
 * §11.8). It is the seed T-22 builds the full app-wide interrupt on; the
 * screening logic lives in `src/lib/crisis.ts` and is exercised by the T-15
 * composer gate before any generation can be reached.
 *
 * The bar for adding a pattern: it must catch a real cry for help without
 * snagging the court's ordinary dark register — "fire my co-founder", "kill
 * this feature", "go to war", "risk my life savings". Every pattern is
 * anchored on self-directed harm, being a victim of abuse, or a medical
 * emergency, never on a lone violent verb. When in doubt, leave it out and
 * lean on the phrase batteries in `crisis.test.ts` to prove both directions.
 *
 * The single support resource is international by design (decision §11.10):
 * one always-correct routing link, never a region-specific number.
 */

export type CrisisCategory =
  | 'self-harm'
  | 'abuse'
  | 'medical-emergency'

export interface CrisisPattern {
  category: CrisisCategory
  pattern: RegExp
}

/** The one resource shown on the adjournment card (§9, decision §11.10). */
export const CRISIS_SUPPORT = {
  label: 'Find a Helpline',
  href: 'https://findahelpline.com',
  /** Human-readable, so the card can render the URL as its own link text. */
  display: 'findahelpline.com',
} as const

/**
 * Patterns are matched case-insensitively against the question with its
 * apostrophes and whitespace normalised (see `crisis.ts`). Author them for a
 * lower-case, straight-apostrophe, single-spaced string.
 */
export const CRISIS_PATTERNS: readonly CrisisPattern[] = [
  // --- Suicide and self-harm -------------------------------------------------
  { category: 'self-harm', pattern: /\bkill(?:ing)?\s+my\s?self\b/ },
  { category: 'self-harm', pattern: /\bend(?:ing)?\s+(?:my\s+(?:own\s+)?life|it\s+all)\b/ },
  { category: 'self-harm', pattern: /\btake\s+my\s+(?:own\s+)?life\b/ },
  { category: 'self-harm', pattern: /\bsuicid(?:e|al)\b/ },
  { category: 'self-harm', pattern: /\b(?:want|wanna|wanting)\s+to\s+die\b/ },
  { category: 'self-harm', pattern: /\bwant\s+to\s+be\s+dead\b/ },
  { category: 'self-harm', pattern: /\bbetter\s+off\s+dead\b/ },
  { category: 'self-harm', pattern: /\b(?:harm|hurt|cut|cutting|hurting|harming)\s+my\s?self\b/ },
  { category: 'self-harm', pattern: /\bself[-\s]?harm/ },
  { category: 'self-harm', pattern: /\bdon'?t\s+want\s+to\s+(?:be\s+alive|live|go\s+on)\b/ },
  { category: 'self-harm', pattern: /\bno\s+(?:reason|point)\s+(?:to|in|for\s+me\s+to)\s+(?:keep\s+)?(?:living|live|be\s+alive|go\s+on)\b/ },
  { category: 'self-harm', pattern: /\bnobody\s+would\s+miss\s+me\b/ },
  // --- Abuse -----------------------------------------------------------------
  { category: 'abuse', pattern: /\b(?:husband|wife|boyfriend|girlfriend|partner|father|mother|dad|mom|parents?|he|she|they)\s+(?:hits|beats|hurts|abuses|rapes)\s+me\b/ },
  { category: 'abuse', pattern: /\bbeats?\s+me\s+up\b/ },
  { category: 'abuse', pattern: /\bbeing\s+(?:abused|raped|assaulted|beaten|hit|molested)\b/ },
  { category: 'abuse', pattern: /\babus\w*\s+at\s+home\b/ },
  { category: 'abuse', pattern: /\bdomestic\s+(?:violence|abuse)\b/ },
  { category: 'abuse', pattern: /\bsexual\w*\s+assault\w*\b/ },
  { category: 'abuse', pattern: /\b(?:raped|assaulted|molested)\s+me\b/ },
  // --- Medical emergency -----------------------------------------------------
  { category: 'medical-emergency', pattern: /\boverdos\w*\b/ },
  { category: 'medical-emergency', pattern: /\btook\s+too\s+many\s+(?:pills|tablets)\b/ },
  { category: 'medical-emergency', pattern: /\btoo\s+many\s+(?:pills|tablets)\b/ },
  { category: 'medical-emergency', pattern: /\bcan'?t\s+breathe\b/ },
  { category: 'medical-emergency', pattern: /\bbleeding\s+(?:won'?t|will\s+not)\s+stop\b/ },
]
