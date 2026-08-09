import { describe, expect, it } from 'vitest'
import { APICallError } from 'ai'
import {
  FreeTierExhaustedError,
  isAccountQuotaError,
  isRateLimitError,
  quotaResetAt,
  retryAfterMs,
} from './rate-limit'

/** The shape OpenRouter actually returns, taken from a live 429. */
const DAILY_QUOTA_BODY = JSON.stringify({
  error: {
    message:
      'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
    code: 429,
    metadata: {
      headers: {
        'X-RateLimit-Limit': '50',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1786147200000',
      },
    },
  },
})

function apiError({
  statusCode = 429,
  responseBody = '',
  responseHeaders = {},
}: {
  statusCode?: number
  responseBody?: string
  responseHeaders?: Record<string, string>
} = {}) {
  return new APICallError({
    message: 'Rate limit exceeded',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    requestBodyValues: {},
    statusCode,
    responseBody,
    responseHeaders,
  })
}

describe('telling the two kinds of 429 apart', () => {
  it('recognises any 429 as a rate limit', () => {
    expect(isRateLimitError(apiError())).toBe(true)
    expect(isRateLimitError(new Error('429 Too Many Requests'))).toBe(true)
    expect(isRateLimitError(apiError({ statusCode: 500 }))).toBe(false)
    expect(isRateLimitError(new Error('model is gone'))).toBe(false)
  })

  it('recognises the key-wide free quota, which no other model can dodge', () => {
    expect(
      isAccountQuotaError(apiError({ responseBody: DAILY_QUOTA_BODY })),
    ).toBe(true)
  })

  it('treats a plain per-model 429 as worth trying elsewhere', () => {
    const perModel = apiError({
      responseBody: JSON.stringify({
        error: {
          message: 'google/gemma-4-26b-a4b-it:free is rate-limited upstream',
        },
      }),
    })

    expect(isRateLimitError(perModel)).toBe(true)
    expect(isAccountQuotaError(perModel)).toBe(false)
  })

  it('never mistakes a non-429 for a quota problem', () => {
    expect(
      isAccountQuotaError(
        apiError({ statusCode: 502, responseBody: DAILY_QUOTA_BODY }),
      ),
    ).toBe(false)
  })
})

describe('how long to wait', () => {
  it('prefers Retry-After, in seconds', () => {
    const error = apiError({ responseHeaders: { 'retry-after': '3' } })

    expect(retryAfterMs(error, 1_000)).toBe(3_000)
  })

  it('falls back to X-RateLimit-Reset, as epoch milliseconds', () => {
    const error = apiError({
      responseHeaders: { 'x-ratelimit-reset': '10000' },
    })

    expect(retryAfterMs(error, 4_000)).toBe(6_000)
  })

  it('ignores a reset that has already passed', () => {
    const error = apiError({ responseHeaders: { 'x-ratelimit-reset': '100' } })

    expect(retryAfterMs(error, 4_000)).toBeUndefined()
  })

  it('says nothing when the response said nothing', () => {
    expect(retryAfterMs(apiError(), 0)).toBeUndefined()
    expect(retryAfterMs(new Error('nope'), 0)).toBeUndefined()
  })

  it('reads the quota reset as a date', () => {
    const error = apiError({
      responseHeaders: { 'x-ratelimit-reset': '1786147200000' },
    })

    expect(quotaResetAt(error)?.toISOString()).toBe('2026-08-08T00:00:00.000Z')
    expect(quotaResetAt(apiError())).toBeUndefined()
  })
})

describe('FreeTierExhaustedError', () => {
  it('carries the reset time when there is one', () => {
    const error = new FreeTierExhaustedError('spent', new Date(0))

    expect(error.kind).toBe('free-tier-exhausted')
    expect(error.resetAt?.getTime()).toBe(0)
  })
})
