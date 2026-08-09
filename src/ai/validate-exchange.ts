import type { Counselor, CounselorRoster } from '@/domain/counselor'

/**
 * The anti-sycophancy contract (§5.4), enforced post-hoc.
 *
 * The prompt asks for it; this checks whether it happened. A turn must dispute
 * a *named* other counselor and must not reach for the phrases that turn a
 * council into a meeting.
 *
 * Note the asymmetry with the prompt: the prompt says "name exactly one", this
 * requires "names at least one" (T-11's own wording). A turn that lands on two
 * rivals at once is good drama, not a violation — the first one named becomes
 * `targetId`.
 */

/** §5.4 — banned outright. Written as a model would write them, matched
 *  case-insensitively, and quoted verbatim into the prompt. */
export const BANNED_PHRASES: readonly string[] = [
  'I agree',
  'building on that',
  'excellent point',
  'you raise a fair point',
]

export type ExchangeViolation =
  'empty' | 'no-target-named' | 'target-not-seated' | 'banned-phrase'

export interface ExchangeCandidate {
  counselorId: string
  text: string
  /** Usually derived from the text; passed in when the caller already knows. */
  targetId?: string | null
}

export interface ExchangeContext {
  seated: readonly string[]
  roster: CounselorRoster
}

export interface ExchangeValidation {
  ok: boolean
  /** The counselor being disputed, or null if nobody was named. */
  targetId: string | null
  violations: ExchangeViolation[]
  /** Every seated counselor named in the text, in order of first mention. */
  named: string[]
  /** The banned phrases actually found, for the retry reminder. */
  bannedFound: string[]
}

/**
 * Tokens low on signal: honorifics and filler that would match half the court
 * or half the language. `mistress` is not here because it is dropped
 * dynamically instead — see `buildNameIndex`.
 */
const WEAK_TOKENS = new Set([
  'a',
  'and',
  'of',
  'the',
  'lord',
  'old',
  'voice',
  'king',
])

/**
 * How a counselor can be referred to on the floor: name words and office
 * words. Wren's own sample line calls Vane "the Marshal", so offices count.
 */
export function nameTokens(counselor: Counselor): string[] {
  const words = `${counselor.name} ${counselor.title}`
    .toLowerCase()
    .split(/[^\p{L}'']+/u)
    .map(stripPossessive)
    .filter((word) => word.length >= 3 && !WEAK_TOKENS.has(word))

  return [...new Set(words)]
}

/** "Marshal's" and "Marshal" are the same man. */
function stripPossessive(word: string): string {
  return word.replace(/['']s$/u, '')
}

/**
 * token → counselor id, for the seated council only. A token claimed by two
 * seated counselors ("mistress", when both Marrow and Wren are at the table)
 * is dropped: it names nobody in particular.
 */
function buildNameIndex(ctx: ExchangeContext): Map<string, string> {
  const claims = new Map<string, Set<string>>()

  for (const id of ctx.seated) {
    const counselor = ctx.roster[id]
    if (counselor === undefined) continue

    for (const token of nameTokens(counselor)) {
      const owners = claims.get(token) ?? new Set<string>()
      owners.add(id)
      claims.set(token, owners)
    }
  }

  const index = new Map<string, string>()
  for (const [token, owners] of claims) {
    if (owners.size !== 1) continue
    index.set(token, [...owners][0])
  }

  return index
}

/** Every seated counselor named in `text`, in order of first mention. */
export function findNamedCounselors(
  text: string,
  ctx: ExchangeContext,
  { exclude }: { exclude?: string } = {},
): string[] {
  const index = buildNameIndex(ctx)
  const found: Array<{ id: string; at: number }> = []
  const seen = new Set<string>()

  for (const match of text.toLowerCase().matchAll(/[\p{L}'']+/gu)) {
    const token = stripPossessive(match[0])
    const id = index.get(token)
    if (id === undefined || id === exclude || seen.has(id)) continue

    seen.add(id)
    found.push({ id, at: match.index })
  }

  return found.sort((a, b) => a.at - b.at).map((entry) => entry.id)
}

/** The first other seated counselor named in the turn, if any. */
export function deriveTargetId(
  text: string,
  candidate: Pick<ExchangeCandidate, 'counselorId'>,
  ctx: ExchangeContext,
): string | null {
  const named = findNamedCounselors(text, ctx, {
    exclude: candidate.counselorId,
  })
  return named[0] ?? null
}

export function findBannedPhrases(text: string): string[] {
  const haystack = text.toLowerCase()
  return BANNED_PHRASES.filter((phrase) =>
    haystack.includes(phrase.toLowerCase()),
  )
}

export function validateExchange(
  candidate: ExchangeCandidate,
  ctx: ExchangeContext,
): ExchangeValidation {
  const violations: ExchangeViolation[] = []
  const text = candidate.text.trim()

  if (text.length === 0) violations.push('empty')

  const named = findNamedCounselors(text, ctx, {
    exclude: candidate.counselorId,
  })
  const targetId = candidate.targetId ?? named[0] ?? null

  // Two separate failures: nobody was named at all, versus a target that is
  // named but is not a rival at this table.
  if (named.length === 0) violations.push('no-target-named')
  if (
    targetId !== null &&
    (!ctx.seated.includes(targetId) || targetId === candidate.counselorId)
  ) {
    violations.push('target-not-seated')
  }

  const bannedFound = findBannedPhrases(text)
  if (bannedFound.length > 0) violations.push('banned-phrase')

  return {
    ok: violations.length === 0,
    targetId,
    violations,
    named,
    bannedFound,
  }
}

/**
 * The stricter reminder for the one-shot retry (§5.4). Written in the court's
 * register, because it is spoken to a counselor, not logged for an engineer.
 */
export function violationReasons(
  validation: Pick<ExchangeValidation, 'violations' | 'bannedFound'>,
): string[] {
  const reasons: string[] = []

  for (const violation of validation.violations) {
    switch (violation) {
      case 'empty':
        reasons.push('You said nothing at all.')
        break
      case 'no-target-named':
        reasons.push(
          'You named no one at this table. A rebuttal with no name in it is a speech.',
        )
        break
      case 'target-not-seated':
        reasons.push(
          'You disputed someone who is not seated at this council. Dispute someone who is.',
        )
        break
      case 'banned-phrase':
        reasons.push(
          `You were agreeable: ${validation.bannedFound
            .map((phrase) => `"${phrase}"`)
            .join(', ')}. This is a council, not a chorus.`,
        )
        break
    }
  }

  return reasons
}
