import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_IN_FLIGHT,
  configureThrottle,
  resetThrottle,
  throttled,
} from './throttle'

/** A promise you can settle from the outside. */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

afterEach(() => {
  resetThrottle()
  configureThrottle({ minStartGapMs: 0 })
})

describe('the request pacer', () => {
  it('never runs more than MAX_IN_FLIGHT tasks at once', async () => {
    configureThrottle({ minStartGapMs: 0 })

    const gates = Array.from({ length: 5 }, deferred)
    let running = 0
    let peak = 0

    const runs = gates.map((gate) =>
      throttled(async () => {
        running += 1
        peak = Math.max(peak, running)
        await gate.promise
        running -= 1
      }),
    )

    // Let the first wave start, then release the tasks one at a time.
    await Promise.resolve()
    expect(peak).toBe(MAX_IN_FLIGHT)

    for (const gate of gates) {
      gate.resolve()
      await Promise.resolve()
      await Promise.resolve()
    }

    await Promise.all(runs)
    expect(peak).toBe(MAX_IN_FLIGHT)
    expect(running).toBe(0)
  })

  it('releases its slot even when the task throws', async () => {
    configureThrottle({ minStartGapMs: 0 })

    await expect(
      throttled(async () => {
        throw new Error('model refused')
      }),
    ).rejects.toThrow('model refused')

    // The slot came back: a following task still runs.
    await expect(throttled(async () => 'spoke')).resolves.toBe('spoke')
  })

  it('leaves a gap between starts when one is configured', async () => {
    configureThrottle({ minStartGapMs: 40 })
    const started: number[] = []
    const begin = Date.now()

    await throttled(async () => {
      started.push(Date.now() - begin)
    })
    await throttled(async () => {
      started.push(Date.now() - begin)
    })

    expect(started[1] - started[0]).toBeGreaterThanOrEqual(30)
  })

  it('returns the task’s value untouched', async () => {
    await expect(throttled(async () => 42)).resolves.toBe(42)
  })
})
