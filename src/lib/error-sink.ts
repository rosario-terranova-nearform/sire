import { NoOutputGeneratedError } from 'ai'
import { countMetric } from './metrics'

/**
 * The last line of defence behind §7.1: the court never shows a stack trace.
 *
 * When a model refuses, the AI SDK rejects promises on the abandoned result
 * object (`text`, `finishReason`, `steps`) that our layer never awaits — it
 * wanted the stream, and it already handled the failure by falling through the
 * chain or going to tape. Those rejections have no owner, so the browser logs
 * them as "uncaught (in promise)" beside a red stack, which is alarming and
 * says nothing true: by the time one appears, the failure has been dealt with.
 *
 * It swallows exactly one class: `NoOutputGeneratedError`, which is what an
 * abandoned result rejects with. Deliberately not "any AI SDK error" — a
 * timeout or an API error reaching an unhandled rejection means some path
 * forgot to await it, and hiding that would hide a bug.
 */

/** The one rejection an abandoned `streamText` result produces. */
export function isSpentModelRejection(reason: unknown): boolean {
  return NoOutputGeneratedError.isInstance(reason)
}

export function installModelErrorSink(
  target: EventTarget = window,
): () => void {
  const onRejection = (event: Event) => {
    const { reason } = event as PromiseRejectionEvent
    if (!isSpentModelRejection(reason)) return

    // Handled upstream: keep the record, drop the stack trace.
    event.preventDefault()
    countMetric('spent_model_rejection', {
      error: reason instanceof Error ? reason.name : 'unknown',
    })
  }

  target.addEventListener('unhandledrejection', onRejection)
  return () => target.removeEventListener('unhandledrejection', onRejection)
}
