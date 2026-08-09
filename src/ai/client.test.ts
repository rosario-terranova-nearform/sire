import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MissingApiKeyError,
  getProvider,
  hasApiKey,
  readApiKey,
  resetProviderCache,
} from './client'

describe('the OpenRouter client (§7)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetProviderCache()
  })

  it('reads the key from the client-side env', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-test')

    expect(readApiKey()).toBe('sk-or-test')
    expect(hasApiKey()).toBe(true)
  })

  it('treats a blank key as no key at all', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '   ')

    expect(readApiKey()).toBeUndefined()
    expect(hasApiKey()).toBe(false)
  })

  it('throws MissingApiKeyError rather than building a useless provider', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '')

    expect(() => getProvider()).toThrow(MissingApiKeyError)
  })

  it('reuses one provider per key', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-test')

    expect(getProvider()).toBe(getProvider())
  })

  it('rebuilds the provider when the key changes', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-one')
    const first = getProvider()

    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-two')

    expect(getProvider()).not.toBe(first)
  })

  it('builds chat models, not completion models', () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-test')

    const model = getProvider().chat('openrouter/free')

    expect(model.modelId).toBe('openrouter/free')
    expect(model.provider).toContain('openrouter')
  })
})
