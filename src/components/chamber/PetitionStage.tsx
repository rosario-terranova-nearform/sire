import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CounselorCard } from '@/components/CounselorCard'
import type { CounselorRoster } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import type { PetitionView } from '@/hooks/useChamber'

/**
 * §5.3 / §8.1 / T-17 — the petition row. One card per seated counselor,
 * streaming its independent opinion. Cards "enter the chamber" on a staggered
 * `AnimatePresence` entrance and fill at their own rate; a seat that never
 * spoke reads as a held tongue rather than an error.
 */
export interface PetitionStageProps {
  petitions: readonly PetitionView[]
  roster?: CounselorRoster
}

/** In-world loading copy (§8.1: "the Marshal clears his throat"). */
function enterLine(name: string): string {
  return `${name} clears their throat…`
}

/** A seat that produced nothing — the recording's held tongue, dressed in-world. */
const HELD_TONGUE = 'holds their tongue, and the silence carries.'

export function PetitionStage({
  petitions,
  roster = COUNSELORS_BY_ID,
}: PetitionStageProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section aria-label="Petitions" className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl">The court petitions</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {petitions.map((petition, index) => {
            const counselor = roster[petition.counselorId]
            if (counselor === undefined) return null

            const speech =
              petition.status === 'silent'
                ? `${counselor.name} ${HELD_TONGUE}`
                : petition.text

            return (
              <motion.div
                key={petition.counselorId}
                layout={!reduceMotion}
                initial={
                  reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { delay: index * 0.18, type: 'spring', stiffness: 260, damping: 26 }
                }
              >
                <CounselorCard
                  counselor={counselor}
                  variant="speaking"
                  speech={speech}
                  placeholder={enterLine(counselor.name)}
                  className="h-full"
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}
