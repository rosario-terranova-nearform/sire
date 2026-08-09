import { APICallError } from 'ai'

/**
 * Telling the two kinds of 429 apart, because they want opposite responses.
 *
 * A *model* rate limit is per-model and transient: waiting a moment, or trying
 * the next model in the chain, fixes it.
 *
 * An *account* rate limit — OpenRouter's `free-models-per-day` quota — is
 * neither. Every free model in every chain is on the same key, so walking the
 * chain is pure waste, and the only thing below the free tiers is the paid
 * router. Spending the monarch's money because a free quota ran out is not a
 * decision this layer gets to make on its own, so the court goes to tape
 * instead (§7.1) and the banner says why.
 */

/** Markers OpenRouter uses for the key-wide free quota. */
const ACCOUNT_QUOTA_MARKERS = [
  'free-models-per-day',
  'free-models-per-min',
  'openrouter_free_tier',
  'free model requests per day',
]

export class FreeTierExhaustedError extends Error {
  readonly kind = 'free-tier-exhausted'
  /** When the quota resets, if the response said so. */
  readonly resetAt?: Date

  constructor(message: string, resetAt?: Date) {
    super(message)
    this.name = 'FreeTierExhaustedError'
    this.resetAt = resetAt
  }
}

function asApiCallError(error: unknown): APICallError | undefined {
  return APICallError.isInstance(error) ? error : undefined
}

/** Any 429, from either cause. */
export function isRateLimitError(error: unknown): boolean {
  // When the provider gave us a status code, that is the answer — a 502 whose
  // body happens to mention rate limits is still a 502.
  const api = asApiCallError(error)
  if (api !== undefined) return api.statusCode === 429

  return (
    error instanceof Error &&
    /rate limit|too many requests/i.test(error.message)
  )
}

/** A 429 that no other model on this key can dodge. */
export function isAccountQuotaError(error: unknown): boolean {
  if (!isRateLimitError(error)) return false

  const api = asApiCallError(error)
  const haystack = `${api?.responseBody ?? ''} ${
    error instanceof Error ? error.message : ''
  }`.toLowerCase()

  return ACCOUNT_QUOTA_MARKERS.some((marker) => haystack.includes(marker))
}

/** `Retry-After` (seconds) or `X-RateLimit-Reset` (epoch ms), if either is set. */
export function retryAfterMs(error: unknown, now: number): number | undefined {
  const headers = asApiCallError(error)?.responseHeaders
  if (headers === undefined) return undefined

  const retryAfter = Number(headers['retry-after'])
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000

  const reset = Number(headers['x-ratelimit-reset'])
  if (Number.isFinite(reset) && reset > now) return reset - now

  return undefined
}

export function quotaResetAt(error: unknown): Date | undefined {
  const reset = Number(
    asApiCallError(error)?.responseHeaders?.['x-ratelimit-reset'],
  )
  return Number.isFinite(reset) && reset > 0 ? new Date(reset) : undefined
}
