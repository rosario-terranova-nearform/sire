import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError, NoOutputGeneratedError } from 'ai'
import { installModelErrorSink, isSpentModelRejection } from './error-sink'
import { getMetric, resetMetrics } from './metrics'

beforeEach(() => {
  resetMetrics()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('what counts as an already-spent model failure (§7.1)', () => {
  it('claims the rejection an abandoned result produces', () => {
    expect(isSpentModelRejection(new NoOutputGeneratedError())).toBe(true)
  })

  it('leaves every other failure alone, so real bugs still shout', () => {
    // An API error that reaches an unhandled rejection means some path forgot
    // to await it. Swallowing that would hide a bug, not a nuisance.
    expect(
      isSpentModelRejection(
        new APICallError({
          message: 'Rate limit exceeded',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 429,
        }),
      ),
    ).toBe(false)
    expect(isSpentModelRejection(new TypeError('x is not a function'))).toBe(
      false,
    )
    expect(isSpentModelRejection('a string')).toBe(false)
    expect(isSpentModelRejection(undefined)).toBe(false)
  })
})

describe('the sink itself', () => {
  /** A stand-in for `PromiseRejectionEvent`, which jsdom does not implement. */
  function rejection(reason: unknown) {
    const event = new Event('unhandledrejection', { cancelable: true })
    Object.defineProperty(event, 'reason', { value: reason })
    return event
  }

  it('swallows a spent model rejection and records it', () => {
    const target = new EventTarget()
    installModelErrorSink(target)

    const event = rejection(new NoOutputGeneratedError())
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(getMetric('spent_model_rejection')).toBe(1)
  })

  it('lets an unrelated rejection through untouched', () => {
    const target = new EventTarget()
    installModelErrorSink(target)

    const event = rejection(new TypeError('genuinely broken'))
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(getMetric('spent_model_rejection')).toBe(0)
  })

  it('can be uninstalled', () => {
    const target = new EventTarget()
    const uninstall = installModelErrorSink(target)
    uninstall()

    const event = rejection(new NoOutputGeneratedError())
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
