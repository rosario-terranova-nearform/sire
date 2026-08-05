/** Mirrors `SpriteState` in the eventual `domain/counselor.ts` (T-05). */
export type SpriteState = 'neutral' | 'pleased' | 'appalled' | 'scheming'

export const SPRITE_FRAME_ORDER: readonly SpriteState[] = [
  'neutral',
  'pleased',
  'appalled',
  'scheming',
]

export const SPRITE_FRAME_SIZE = 32
