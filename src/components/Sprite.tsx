import { cn } from '@/lib/utils'
import {
  SPRITE_FRAME_ORDER,
  SPRITE_FRAME_SIZE,
  SPRITE_MOOD_LABEL,
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
  /** The counselor's name, for alt text. Falls back to the id (T-24). */
  name?: string
  /** Override the composed alt text entirely (e.g. a decorative sprite could
   *  pass '' to hide it from the accessibility tree). */
  alt?: string
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
  name,
  alt,
}: SpriteProps) {
  const frameIndex = SPRITE_FRAME_ORDER.indexOf(state)
  const sheetWidth = SPRITE_FRAME_SIZE * SPRITE_FRAME_ORDER.length * scale
  // T-24: "{name}, {mood}", the alt text per sprite state. An explicit empty
  // string hides a purely decorative sprite; anything else composes the default.
  const label =
    alt ?? `${name ?? counselorId}, ${SPRITE_MOOD_LABEL[state]}`
  const decorative = label.length === 0

  return (
    <div
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cn(SCALE_CLASS[scale], 'shrink-0 bg-no-repeat', className)}
      style={{
        backgroundImage: `url(/sprites/${counselorId}.png)`,
        backgroundSize: `${sheetWidth}px ${SPRITE_FRAME_SIZE * scale}px`,
        backgroundPosition: `-${frameIndex * SPRITE_FRAME_SIZE * scale}px 0`,
      }}
    />
  )
}
