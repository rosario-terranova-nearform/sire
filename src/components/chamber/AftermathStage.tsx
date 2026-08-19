import { motion, useReducedMotion } from 'motion/react'
import { CounselorCard } from '@/components/CounselorCard'
import { Sprite } from '@/components/Sprite'
import { Badge } from '@/components/ui/pixelact-ui/badge'
import type { Reaction } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { cn } from '@/lib/utils'

/**
 * §5.7 / §8.1 (6) / T-20 — the aftermath. Each counselor's sprite flips to the
 * mood the ruling put them in, says its one line, and its favor delta floats
 * upward before settling — the visible sign that the reign's ledger just moved.
 */
export interface AftermathStageProps {
  reactions: readonly Reaction[]
  roster?: CounselorRoster
  /** The court is still reacting — show the wait rather than an empty scene. */
  loading?: boolean
  /** §3 / T-23 — counselor ids whose agenda just crossed the reveal threshold
   *  this audience. Their masks flip open here, the moment they unlock. */
  newlyRevealed?: readonly string[]
}

export function AftermathStage({
  reactions,
  roster = COUNSELORS_BY_ID,
  loading = false,
  newlyRevealed = [],
}: AftermathStageProps) {
  const unmasked = newlyRevealed
    .map((id) => roster[id])
    .filter((counselor) => counselor !== undefined)

  return (
    <section aria-label="Aftermath" className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl">The court reacts</h2>

      {loading && reactions.length === 0 ? (
        <p className="text-sm italic text-muted-foreground" role="status">
          The chamber takes the measure of your ruling…
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reactions.map((reaction) => {
            const counselor = roster[reaction.counselorId]
            if (counselor === undefined) return null
            return (
              <ReactionRow
                key={reaction.counselorId}
                name={counselor.name}
                reaction={reaction}
              />
            )
          })}
        </ul>
      )}

      {unmasked.length > 0 && (
        <section
          aria-label="Agendas revealed"
          className="flex flex-col gap-4 border-t-4 border-gold pt-6"
        >
          <div>
            <h3 className="font-heading text-xl">The mask slips</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You have heard enough of them now to see what they were truly
              after.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {unmasked.map((counselor) => (
              <CounselorCard
                key={counselor.id}
                counselor={counselor}
                variant="full"
                agendaRevealed
                animateAgendaReveal
              />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function ReactionRow({
  name,
  reaction,
}: {
  name: string
  reaction: Reaction
}) {
  const reduceMotion = useReducedMotion()
  const { favorDelta } = reaction
  const deltaLabel = `${favorDelta > 0 ? '+' : ''}${favorDelta}`

  return (
    <li className="flex gap-3">
      <Sprite
        counselorId={reaction.counselorId}
        name={name}
        state={reaction.mood}
        scale={3}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-base">{name}</span>
          <Badge variant="outline">{reaction.mood}</Badge>
          {favorDelta !== 0 && (
            <motion.span
              aria-label={`favor ${deltaLabel}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
              className={cn(
                'font-heading text-sm',
                favorDelta > 0 ? 'text-success' : 'text-wax',
              )}
            >
              {deltaLabel} favor
            </motion.span>
          )}
        </div>
        <p className="mt-1 text-base">&ldquo;{reaction.line}&rdquo;</p>
      </div>
    </li>
  )
}
