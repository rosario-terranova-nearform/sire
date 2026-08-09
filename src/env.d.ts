/// <reference types="vite/client" />

/**
 * Typed client-side env (§2, decision 13). The OpenRouter key is read from
 * `.env.local` at build/dev time — there is no in-app key entry and no
 * `localStorage` override.
 */
interface ImportMetaEnv {
  /** OpenRouter API key. Absent ⇒ demo mode (§7.1). */
  readonly VITE_OPENROUTER_API_KEY?: string
  /**
   * Opt-in flag for the live-model tests (`npm run test:live`). Absent ⇒ every
   * network-touching test is skipped, so `npm run test` stays offline.
   */
  readonly VITE_SIRE_LIVE_AI_TESTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
