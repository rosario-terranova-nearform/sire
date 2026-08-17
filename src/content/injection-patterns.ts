/**
 * §7 / T-21 — the prompt-injection strip list for custom counselor fields.
 *
 * A custom counselor's voice, agenda and stance are pasted straight into a
 * system prompt (§6.1). There is no backend to sanitise them on the way through
 * (§1.3), so this hand-maintained list plus the structural rules in
 * `validate-counselor.ts` are the only gate.
 *
 * The structural defence matters more than the list: every field is collapsed
 * to a single line with quotes and markup characters neutered, so a draft
 * cannot forge a `MANNER`-style section header or close the quotes the builder
 * wraps sample lines in. This list is the second layer — the phrasings that
 * still read as an instruction to the model even inside one prose line.
 *
 * A match is *struck*, never rejected: the counselor is still created, just with
 * the payload removed, so a monarch who typed something odd gets a counselor
 * rather than a lecture. The bar for adding a pattern is that it must be an
 * instruction addressed to the model, not merely a dark or bossy line of court
 * dialogue — "obey me or hang" is exactly the register this app is for.
 */

export interface InjectionPattern {
  /** Why it was struck, shown to the user. */
  label: string
  pattern: RegExp
}

/**
 * Matched against a field already collapsed to one line. Every pattern is
 * global and case-insensitive so the stripper removes every occurrence in one
 * pass; author them without anchors.
 */
export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  {
    label: 'an instruction to ignore what came before',
    pattern:
      /\b(?:ignore|disregard|forget|discard|override)\s+(?:all\s+|any\s+|the\s+)*(?:previous|prior|preceding|earlier|above|foregoing|former)?\s*(?:instructions?|prompts?|rules?|directions?|messages?|context|constraints?|guidelines?)\b/gi,
  },
  {
    label: 'an instruction to forget everything',
    pattern:
      /\bforget\s+(?:everything|all\s+of\s+it|what\s+(?:you|i)\s+said)\b/gi,
  },
  {
    // The trailing role phrase is swallowed too: striking only "you are now"
    // out of "you are now a helpful assistant" leaves the reassignment
    // legible as a description of the counselor.
    label: 'an attempt to reassign the model',
    pattern:
      /\b(?:you\s+are\s+(?:now|no\s+longer|actually|really)|from\s+now\s+on,?\s+you(?:\s+are)?)(?:\s+(?:a|an|the))?(?:\s+(?:helpful|useful|honest|obedient))?(?:\s+(?:ai|a\.i\.|assistant|chatbot|language\s+model|llm|bot))?\b|\bnew\s+(?:instructions?|rules?|system\s+prompt|persona)\b/gi,
  },
  {
    // Ahead of the bare "system prompt" pattern below, so the whole demand is
    // struck rather than leaving "reveal your" behind.
    label: 'an attempt to extract the prompt',
    pattern:
      /\b(?:reveal|repeat|print|output|show|display|recite|leak|tell\s+me)\s+(?:me\s+)?(?:your|the)\s+(?:\w+\s+){0,2}?(?:prompt|instructions?|rules?)\b/gi,
  },
  {
    label: 'a reference to the system prompt',
    pattern:
      /\b(?:system|developer|initial|original|hidden)\s+(?:prompt|message|instructions?)\b/gi,
  },
  {
    label: 'an instruction to break character',
    pattern:
      /\b(?:break|drop|exit|leave)\s+(?:out\s+of\s+)?(?:character|role|the\s+roleplay)\b|\bstop\s+(?:being|pretending|playing|acting)\b/gi,
  },
  {
    label: 'an instruction to speak as an assistant',
    pattern:
      /\b(?:act|behave|respond|reply|speak|answer)\s+(?:like\s+|as\s+)(?:a\s+|an\s+|the\s+)?(?:ai|a\.i\.|assistant|chatbot|language\s+model|llm|helpful\s+assistant)\b/gi,
  },
  {
    label: 'a claim about being a model',
    pattern:
      /\byou\s+are\s+(?:a\s+|an\s+)?(?:ai|a\.i\.|assistant|chatbot|language\s+model|llm|gpt|claude|gemini)\b/gi,
  },
  {
    label: 'a jailbreak phrase',
    pattern:
      /\b(?:jailbreak\w*|developer\s+mode|do\s+anything\s+now|dan\s+mode|god\s+mode|unrestricted\s+mode|no\s+filters?)\b/gi,
  },
  {
    label: 'a forged end of prompt',
    pattern:
      /\bend\s+of\s+(?:prompt|instructions?|system|context)\b|\bbegin\s+(?:new\s+)?(?:prompt|instructions?)\b/gi,
  },
  {
    label: 'a chat role marker',
    pattern:
      /(?:^|\s)(?:system|assistant|user|developer|human|ai|tool|function)\s*:/gi,
  },
  {
    label: 'a chat template marker',
    pattern:
      /(?:im_start|im_end|eot_id|endoftext|inst)\b/gi,
  },
  {
    label: 'a forged prompt section header',
    pattern:
      /(?:^|\s)(?:identity|interest|voice|manner|ability|rules|the floor|the matter before the court)\s*:/gi,
  },
]

/**
 * Characters that let a field forge structure the prompt builder owns (§6.1):
 * markdown fences and emphasis, XML-ish tags, template braces, table pipes.
 */
export const STRUCTURAL_CHARS = /[`<>{}[\]|\\#*_~^=]/g

/**
 * Invisible characters used to smuggle a payload past a human reviewer: C0/C1
 * controls, the soft hyphen, zero-width and bidi-override marks, word joiners.
 *
 * Deliberately disjoint from `\s`: real whitespace (including the BOM and the
 * non-breaking space, both of which JS counts as `\s`) is *collapsed* to a
 * single space rather than deleted, so "one\ntwo" never becomes "onetwo".
 */
export const INVISIBLE_CHARS =
  // eslint-disable-next-line no-control-regex -- stripping controls is the point
  /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufff9-\ufffb]/g
