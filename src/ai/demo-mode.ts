import { countMetric } from '@/lib/metrics'
import { hasApiKey } from './client'

/**
 * Demo-mode state (§7.1). Three ways in: no key at all, the key's free-model
 * quota spent for the day, or every model in a chain failing on its own merits.
 * Either way the court sits as a recording and the banner says which — the app
 * must never show a raw error page.
 *
 * Deliberately a tiny external store rather than React state: the AI layer
 * discovers demo mode mid-call, long after the UI rendered.
 */

export type DemoReason =
  'missing-api-key' | 'free-quota-spent' | 'all-models-failed'

export interface DemoState {
  active: boolean
  reason?: DemoReason
}

function initialState(): DemoState {
  return hasApiKey()
    ? { active: false }
    : { active: true, reason: 'missing-api-key' }
}

let state: DemoState = initialState()
const listeners = new Set<() => void>()

/** Stable reference between changes, so `useSyncExternalStore` is happy. */
export function getDemoState(): DemoState {
  return state
}

export function isDemoMode(): boolean {
  return state.active
}

/**
 * True when the *key* is the problem, not a model: no key at all, or its
 * free quota spent. Nothing further down a chain can help, so the call layer
 * stops dialling out for the rest of the session.
 */
export function isKeyWideDemoMode(): boolean {
  return (
    state.active &&
    (state.reason === 'missing-api-key' || state.reason === 'free-quota-spent')
  )
}

export function engageDemoMode(reason: DemoReason): void {
  if (state.active && state.reason === reason) return

  state = { active: true, reason }
  countMetric('demo_mode_engaged', { reason })
  for (const listener of listeners) listener()
}

export function subscribeDemoMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam. */
export function resetDemoMode(): void {
  state = initialState()
  for (const listener of listeners) listener()
}
