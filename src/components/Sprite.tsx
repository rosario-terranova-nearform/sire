import { cn } from '@/lib/utils'
import {
  SPRITE_FRAME_ORDER,
  SPRITE_FRAME_SIZE,
  type SpriteState,
} from '@/lib/sprite'

const SCALE_CLASS = {
  2: 'sprite-2x',
  3: 'sprite-3x',
  4: 'sprite-4x',
} as const

interface SpriteProps {
  /** Matches the sheet filename: `/sprites/{counselorId}.png`. */
  counselorId: string
  state: SpriteState
  scale?: 2 | 3 | 4
  className?: string
}

/**
 * Renders one frame of a counselor's sprite sheet via `background-position`
 * steps, never a per-frame `<img>` swap — so switching `state` never
 * changes the element's box size (spec §5.7, T-04).
 */
export function Sprite({
  counselorId,
  state,
  scale = 2,
  className,
}: SpriteProps) {
  const frameIndex = SPRITE_FRAME_ORDER.indexOf(state)
  const sheetWidth = SPRITE_FRAME_SIZE * SPRITE_FRAME_ORDER.length * scale

  return (
    <div
      role="img"
      aria-label={`${counselorId}, ${state}`}
      className={cn(SCALE_CLASS[scale], 'shrink-0 bg-no-repeat', className)}
      style={{
        backgroundImage: `url(/sprites/${counselorId}.png)`,
        backgroundSize: `${sheetWidth}px ${SPRITE_FRAME_SIZE * scale}px`,
        backgroundPosition: `-${frameIndex * SPRITE_FRAME_SIZE * scale}px 0`,
      }}
    />
  )
}
