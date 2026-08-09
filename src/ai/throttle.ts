/**
 * A pacer in front of OpenRouter.
 *
 * §5.3 wants petitions fired in parallel, and that is right for the scene —
 * but "all five at once, each retried, each falling through four models" is a
 * burst of up to sixty requests for one stage, and free models are rate-limited
 * per key. Two in flight with a short gap between starts keeps the staggered
 * "cards fill at different rates" feel while staying inside the limits.
 *
 * This is not the user-facing rate limiting §7.1 rules out — there is still one
 * local user against their own key. It is politeness toward the *provider's*
 * limits, which exist whether the app respects them or not.
 */

export const MAX_IN_FLIGHT = 2
export const MIN_START_GAP_MS = 350

interface Waiter {
  resolve: () => void
}

let maxInFlight = MAX_IN_FLIGHT
let minStartGapMs = MIN_START_GAP_MS
let inFlight = 0
let lastStart = 0
const queue: Waiter[] = []

/**
 * Pacing is a production concern: the unit suite sets the gap to 0 so it never
 * sleeps, and asserts the concurrency cap on its own (see `throttle.test.ts`).
 */
export function configureThrottle(
  settings: Partial<{ maxInFlight: number; minStartGapMs: number }>,
): void {
  maxInFlight = settings.maxInFlight ?? maxInFlight
  minStartGapMs = settings.minStartGapMs ?? minStartGapMs
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquire(): Promise<void> {
  if (inFlight >= maxInFlight) {
    await new Promise<void>((resolve) => queue.push({ resolve }))
  }

  inFlight += 1

  const gap = lastStart + minStartGapMs - Date.now()
  if (gap > 0) await sleep(gap)
  lastStart = Date.now()
}

function release(): void {
  inFlight -= 1
  queue.shift()?.resolve()
}

/** Run `task` once a slot is free. Rejections propagate untouched. */
export async function throttled<T>(task: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await task()
  } finally {
    release()
  }
}

/** Test seam. */
export function resetThrottle(): void {
  maxInFlight = MAX_IN_FLIGHT
  minStartGapMs = MIN_START_GAP_MS
  inFlight = 0
  lastStart = 0
  queue.length = 0
}
