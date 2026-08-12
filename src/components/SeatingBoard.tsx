import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CounselorCard } from '@/components/CounselorCard'
import type { Counselor } from '@/domain/counselor'
import { MAX_SEATED, MIN_SEATED } from '@/domain/audience'
import { clashHints } from '@/content/faction-clashes'
import { cn } from '@/lib/utils'

/**
 * §5.2 / §8 / T-16 — the seating board. The monarch's first strategic choice:
 * seat 3–5 counselors from the roster. Clash hints surface but never block a
 * legal selection; at capacity the unseated cards go quiet rather than
 * forbidding the click outright.
 *
 * The board owns no persistence and no machine — it renders a selection and
 * reports toggles. The route (`AudienceNew`) persists the default (T-16) and
 * hands the seated council to the chamber.
 */
export interface SeatingBoardProps {
  counselors: readonly Counselor[]
  selected: readonly string[]
  onToggle: (counselorId: string) => void
}

export function SeatingBoard({
  counselors,
  selected,
  onToggle,
}: SeatingBoardProps) {
  const reduceMotion = useReducedMotion()
  const selectedSet = new Set(selected)
  const atCapacity = selected.length >= MAX_SEATED

  const seatedCounselors = counselors.filter((c) => selectedSet.has(c.id))
  const hints = clashHints(seatedCounselors)

  return (
    <section className="flex flex-col gap-6" aria-label="Seat the council">
      <SeatCounter count={selected.length} />

      <ul
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        role="listbox"
        aria-label="The roster"
        aria-multiselectable="true"
      >
        {counselors.map((counselor) => {
          const isSelected = selectedSet.has(counselor.id)
          // At capacity, an unseated card cannot be added (max 5, §4) — it is
          // dimmed and inert, but the seated ones stay removable.
          const locked = atCapacity && !isSelected

          function toggle() {
            if (locked) return
            onToggle(counselor.id)
          }

          return (
            <motion.li
              key={counselor.id}
              layout={!reduceMotion}
              className="list-none"
            >
              <div className="relative">
                <CounselorCard
                  counselor={counselor}
                  variant="compact"
                  selected={isSelected}
                  role="option"
                  tabIndex={locked ? -1 : 0}
                  aria-selected={isSelected}
                  aria-disabled={locked || undefined}
                  aria-label={`${counselor.name}, ${counselor.title}. ${
                    isSelected ? 'Seated.' : 'Not seated.'
                  }`}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggle()
                    }
                  }}
                  className={cn(
                    'h-full transition-opacity',
                    locked
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer hover:ring-2 hover:ring-gold',
                  )}
                />
                <SeatRibbon show={isSelected} reduceMotion={reduceMotion} />
              </div>
            </motion.li>
          )
        })}
      </ul>

      {hints.length > 0 && (
        <div
          className="flex flex-col gap-2 border-l-4 border-gold bg-card p-4"
          aria-label="Council tensions"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            The table will not be calm
          </p>
          <ul className="flex flex-col gap-1">
            {hints.map((hint) => (
              <li key={hint} className="text-sm text-foreground">
                {hint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SeatCounter({ count }: { count: number }) {
  const valid = count >= MIN_SEATED && count <= MAX_SEATED
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      <span className={cn('font-heading text-base', valid ? 'text-gold' : 'text-wax')}>
        {count}
      </span>{' '}
      seated.{' '}
      {count < MIN_SEATED
        ? `Seat at least ${MIN_SEATED} to hold the audience.`
        : count >= MAX_SEATED
          ? `The chamber seats ${MAX_SEATED} at most.`
          : `You may seat up to ${MAX_SEATED}.`}
    </p>
  )
}

/** The seat/unseat flourish (T-16): a wax ribbon that stamps in on selection. */
function SeatRibbon({
  show,
  reduceMotion,
}: {
  show: boolean
  reduceMotion: boolean | null
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          key="ribbon"
          aria-hidden="true"
          initial={reduceMotion ? false : { scale: 0, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: -8, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          className="pointer-events-none absolute -right-2 -top-2 select-none border-2 border-ink bg-wax px-2 py-0.5 font-heading text-xs text-parchment"
        >
          SEATED
        </motion.span>
      )}
    </AnimatePresence>
  )
}
