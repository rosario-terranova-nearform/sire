import { SPRITE_STATES, type SpriteState } from '@/domain/counselor'

export type { SpriteState }

/** Frame order baked into the generated sheets (T-04). */
export const SPRITE_FRAME_ORDER: readonly SpriteState[] = SPRITE_STATES

export const SPRITE_FRAME_SIZE = 32

/**
 * T-24 — a readable phrase per sprite state, so a screen reader hears the mood
 * ("pleased", "appalled") rather than a bare enum. Used to compose a sprite's
 * alt text when the caller does not supply its own.
 */
export const SPRITE_MOOD_LABEL: Record<SpriteState, string> = {
  neutral: 'impassive',
  pleased: 'pleased',
  appalled: 'appalled',
  scheming: 'scheming',
}
