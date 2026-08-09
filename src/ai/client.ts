import {
  createOpenRouter,
  type OpenRouterProvider,
} from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

/**
 * The one place that knows how to reach OpenRouter (§7).
 *
 * There is no backend: the browser calls OpenRouter directly with the user's
 * own key, read from `.env.local` at build/dev time (decision 13). Nothing
 * here touches `localStorage` and nothing asks the user for a key.
 */

/** Sets `X-OpenRouter-Title` — how a local run shows up on the dashboard. */
export const APP_NAME = 'SIRE'

export class MissingApiKeyError extends Error {
  readonly kind = 'missing-api-key'

  constructor() {
    super(
      'VITE_OPENROUTER_API_KEY is not set. Add it to .env.local, or hold court in demo mode.',
    )
    this.name = 'MissingApiKeyError'
  }
}

/** The configured key, or `undefined` when it is missing or blank. */
export function readApiKey(): string | undefined {
  const raw = import.meta.env.VITE_OPENROUTER_API_KEY
  const key = typeof raw === 'string' ? raw.trim() : ''
  return key.length > 0 ? key : undefined
}

export function hasApiKey(): boolean {
  return readApiKey() !== undefined
}

/** Keyed on the key itself, so stubbing the env in a test invalidates it. */
let cached: { key: string; provider: OpenRouterProvider } | undefined

export function getProvider(): OpenRouterProvider {
  const key = readApiKey()
  if (key === undefined) throw new MissingApiKeyError()

  if (cached?.key !== key) {
    cached = {
      key,
      provider: createOpenRouter({
        apiKey: key,
        appName: APP_NAME,
        // We are talking to OpenRouter itself, not a compatible third party.
        compatibility: 'strict',
      }),
    }
  }

  return cached.provider
}

/**
 * Turns a model slug into a language model. Injected into every call in
 * `calls.ts` so tests can hand back a mock without stubbing the network.
 */
export type ModelResolver = (modelId: string) => LanguageModel

/**
 * `.chat()` explicitly: calling the provider directly resolves to the
 * *completion* overload, which would post to the wrong endpoint.
 */
export const resolveLanguageModel: ModelResolver = (modelId) =>
  getProvider().chat(modelId)

/** Test seam for env stubbing that reuses the same key value. */
export function resetProviderCache(): void {
  cached = undefined
}
