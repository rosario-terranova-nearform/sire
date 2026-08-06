import { SPRITE_STATES, type SpriteState } from '@/domain/counselor'

export type { SpriteState }

/** Frame order baked into the generated sheets (T-04). */
export const SPRITE_FRAME_ORDER: readonly SpriteState[] = SPRITE_STATES

export const SPRITE_FRAME_SIZE = 32
