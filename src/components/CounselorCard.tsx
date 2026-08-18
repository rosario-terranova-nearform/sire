import { motion, useReducedMotion } from 'motion/react'
import type {
  Ability,
  Counselor,
  Faction,
  SpriteState,
  Stats,
} from '@/domain/counselor'
import { STAT_KEYS } from '@/domain/counselor'
import type { Voice } from '@/domain/counselor'
import { MAX_FAVOR, MIN_FAVOR } from '@/domain/reign'
import { Sprite } from '@/components/Sprite'
import { Badge } from '@/components/ui/pixelact-ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/pixelact-ui/card'
import { Progress } from '@/components/ui/pixelact-ui/progress'
import { cn } from '@/lib/utils'

/**
 * §8.2 — the card is the app's signature object, in three variants:
 * - `compact`  : seating grid tile (§5.2, T-16).
 * - `speaking` : petition/deliberation card with streaming speech (§5.3–5.4).
 * - `full`     : roster page, the fullest read (T-16 court roster).
 */
export type CounselorCardVariant = 'compact' | 'speaking' | 'full'

export interface CounselorCardProps
  extends Omit<React.ComponentProps<'div'>, 'children'> {
  counselor: Counselor
  variant?: CounselorCardVariant
  /** Sprite mood. Drives the portrait frame; defaults to `neutral`. */
  mood?: SpriteState
  /** Reveal the agenda instead of the masked `AGENDA: ???` state (T-23). */
  agendaRevealed?: boolean
  /** Play the card-flip when the agenda is revealed, for the moment it unmasks
   *  (§3, T-23). Off by default: the roster shows a settled state, not a reveal. */
  animateAgendaReveal?: boolean
  /** Favor, `-10 … +10` (§3). Omit to hide the favor indicator. */
  favor?: number
  /** `speaking` only: the (possibly partial) petition/deliberation text. */
  speech?: string
  /** `speaking` only: in-world line shown before any speech arrives (T-17). */
  placeholder?: string
  /** `compact` only: draw the seated/chosen highlight (T-16). */
  selected?: boolean
}

/** Portrait scale per variant — never fractional (§2.1). */
const SPRITE_SCALE: Record<CounselorCardVariant, 2 | 3 | 4> = {
  compact: 3,
  speaking: 3,
  full: 4,
}

/** Faction favor maps `-10 … +10` onto the 0–100 the pixel bar draws. */
function favorToPercent(favor: number): number {
  const clamped = Math.max(MIN_FAVOR, Math.min(MAX_FAVOR, favor))
  return ((clamped - MIN_FAVOR) / (MAX_FAVOR - MIN_FAVOR)) * 100
}

function favorLabel(favor: number): string {
  return favor > 0 ? `+${favor}` : `${favor}`
}

function StatPips({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-col gap-1.5">
      {STAT_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
            {key}
          </span>
          <div
            className="flex gap-1"
            role="img"
            aria-label={`${key}: ${stats[key]} of 5`}
          >
            {[1, 2, 3, 4, 5].map((pip) => (
              <span
                key={pip}
                aria-hidden="true"
                className={cn(
                  'size-3 border-2 border-ink',
                  pip <= stats[key] ? 'bg-gold' : 'bg-transparent',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FactionBadge({ faction }: { faction: Faction }) {
  return <Badge variant="outline">{faction}</Badge>
}

function AbilityBlock({ ability }: { ability: Ability }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-heading text-base text-foreground">{ability.name}</p>
      <p className="text-sm text-muted-foreground">{ability.description}</p>
    </div>
  )
}

function AgendaBlock({
  agenda,
  revealed,
  animateReveal,
}: {
  agenda: string
  revealed: boolean
  animateReveal: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex flex-col gap-0.5" style={{ perspective: 600 }}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Agenda
      </p>
      {revealed ? (
        // T-23: the mask flips open the moment an agenda unlocks. Everywhere
        // else the revealed agenda simply renders, no spin. Reduced motion
        // (T-24) drops the flip and shows the text at rest.
        <motion.p
          className="text-sm text-foreground"
          style={{ transformOrigin: 'left center' }}
          initial={
            animateReveal && !reduceMotion
              ? { rotateY: -90, opacity: 0 }
              : false
          }
          animate={{ rotateY: 0, opacity: 1 }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }
          }
        >
          {agenda}
        </motion.p>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">AGENDA: ???</p>
      )}
    </div>
  )
}

function VoiceBlock({ voice }: { voice: Voice }) {
  const sample = voice.sampleLines[0]
  return (
    <div className="flex flex-col gap-1 border-t-2 border-stone pt-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Voice
      </p>
      <p className="text-sm text-muted-foreground">{voice.register}</p>
      {sample !== undefined && (
        <p className="mt-1 text-sm italic text-foreground">
          &ldquo;{sample}&rdquo;
        </p>
      )}
    </div>
  )
}

function FavorIndicator({ favor }: { favor: number }) {
  const label = favorLabel(favor)
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Favor
        </span>
        <span className="text-xs text-foreground">{label}</span>
      </div>
      <Progress
        value={favorToPercent(favor)}
        aria-label={`Favor ${label}`}
      />
    </div>
  )
}

function Portrait({
  counselor,
  mood,
  variant,
}: {
  counselor: Counselor
  mood: SpriteState
  variant: CounselorCardVariant
}) {
  return (
    <div className="flex items-start gap-3">
      <Sprite
        counselorId={counselor.id}
        state={mood}
        scale={SPRITE_SCALE[variant]}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <CardTitle className="font-heading">{counselor.name}</CardTitle>
        <CardDescription>{counselor.title}</CardDescription>
        <div className="mt-1">
          <FactionBadge faction={counselor.faction} />
        </div>
      </div>
    </div>
  )
}

export function CounselorCard({
  counselor,
  variant = 'compact',
  mood = 'neutral',
  agendaRevealed = false,
  animateAgendaReveal = false,
  favor,
  speech,
  placeholder,
  selected = false,
  className,
  ...rest
}: CounselorCardProps) {
  const showFavor = favor !== undefined
  const footer = showFavor ? (
    <CardFooter>
      <FavorIndicator favor={favor} />
    </CardFooter>
  ) : null

  const header = (
    <CardHeader>
      <Portrait counselor={counselor} mood={mood} variant={variant} />
    </CardHeader>
  )

  if (variant === 'speaking') {
    return (
      <Card className={className} {...rest}>
        {header}
        <CardContent>
          {speech ? (
            <p className="whitespace-pre-wrap text-base text-foreground">
              {speech}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              {placeholder ?? `${counselor.name} takes the floor…`}
            </p>
          )}
        </CardContent>
        {footer}
      </Card>
    )
  }

  return (
    <Card
      className={cn(selected && 'ring-2 ring-wax', className)}
      data-selected={selected || undefined}
      {...rest}
    >
      {header}
      <CardContent className="flex flex-col gap-4">
        <StatPips stats={counselor.stats} />
        <AbilityBlock ability={counselor.ability} />
        <AgendaBlock
          agenda={counselor.agenda}
          revealed={agendaRevealed}
          animateReveal={animateAgendaReveal}
        />
        {variant === 'full' && <VoiceBlock voice={counselor.voice} />}
      </CardContent>
      {footer}
    </Card>
  )
}
