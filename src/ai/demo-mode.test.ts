import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  engageDemoMode,
  getDemoState,
  installOnlineRecovery,
  isDemoMode,
  isOffline,
  resetDemoMode,
} from './demo-mode'

beforeEach(() => {
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-present')
  resetDemoMode()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('demo-mode offline handling (T-25)', () => {
  it('reads navigator.onLine', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      expect(isOffline()).toBe(true)
    } finally {
      if (original) Object.defineProperty(navigator, 'onLine', original)
      else delete (navigator as unknown as { onLine?: boolean }).onLine
    }
  })

  it('lifts an offline recording when the connection returns', () => {
    const target = new EventTarget()
    const uninstall = installOnlineRecovery(target)

    engageDemoMode('offline')
    expect(isDemoMode()).toBe(true)

    target.dispatchEvent(new Event('online'))
    // A key is present, so recovery drops back to a live court.
    expect(isDemoMode()).toBe(false)

    uninstall()
  })

  it('leaves a missing-key or spent-quota recording in place on reconnect', () => {
    const target = new EventTarget()
    const uninstall = installOnlineRecovery(target)

    engageDemoMode('free-quota-spent')
    target.dispatchEvent(new Event('online'))
    // Coming back online does not refill a spent quota.
    expect(getDemoState().reason).toBe('free-quota-spent')

    uninstall()
  })
})
