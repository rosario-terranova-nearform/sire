import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Sprite } from '@/components/Sprite'
import type { Exchange } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import type { ActiveSpeaker } from '@/hooks/useChamber'
import { cn } from '@/lib/utils'

/**
 * §5.4 / §8.1 / T-18 — the floor, as a transcript log. Turns reveal strictly in
 * engine order (`speaks-last` counselors always land last), each with the
 * speaker's sprite, their name, an arrow to whom they rebut, and their words.
 * The live speaker streams at the foot of the log, and the view auto-scrolls to
 * follow them.
 */
export interface DeliberationStageProps {
  turns: readonly Exchange[]
  activeSpeaker: ActiveSpeaker | null
  roster?: CounselorRoster
}

export function DeliberationStage({
  turns,
  activeSpeaker,
  roster = COUNSELORS_BY_ID,
}: DeliberationStageProps) {
  const reduceMotion = useReducedMotion()
  const followRef = useRef<HTMLLIElement>(null)

  // Auto-scroll follows whoever holds the floor, and settles on the last
  // recorded turn once the room falls quiet.
  const followKey = activeSpeaker?.counselorId ?? turns.at(-1)?.order ?? null
  useEffect(() => {
    if (followKey === null) return
    followRef.current?.scrollIntoView?.({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [followKey, reduceMotion])

  return (
    <section aria-label="Deliberation" className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl">The floor</h2>
      <ol className="flex flex-col gap-4">
        {turns.map((turn) => {
          const speaker = roster[turn.counselorId]
          const target = roster[turn.targetId]
          if (speaker === undefined) return null
          const isLive = activeSpeaker === null && turn === turns.at(-1)
          return (
            <TurnRow
              key={turn.order}
              ref={isLive ? followRef : undefined}
              speakerId={turn.counselorId}
              speakerName={speaker.name}
              targetName={target?.name}
              text={turn.text}
              reduceMotion={reduceMotion}
            />
          )
        })}

        {activeSpeaker !== null && roster[activeSpeaker.counselorId] && (
          <li
            ref={followRef}
            aria-live="polite"
            className="flex gap-3 border-l-4 border-gold pl-3"
          >
            <Sprite
              counselorId={activeSpeaker.counselorId}
              state="scheming"
              scale={2}
            />
            <div className="min-w-0">
              <p className="font-heading text-sm">
                {roster[activeSpeaker.counselorId].name}
                <span className="ml-2 text-xs italic text-muted-foreground">
                  takes the floor…
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base">
                {activeSpeaker.text}
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-ink align-middle" />
              </p>
            </div>
          </li>
        )}
      </ol>
    </section>
  )
}

interface TurnRowProps {
  ref?: React.Ref<HTMLLIElement>
  speakerId: string
  speakerName: string
  targetName?: string
  text: string
  reduceMotion: boolean | null
}

function TurnRow({
  ref,
  speakerId,
  speakerName,
  targetName,
  text,
  reduceMotion,
}: TurnRowProps) {
  return (
    <motion.li
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
      className={cn('flex gap-3 border-b-2 border-stone pb-4')}
    >
      <Sprite counselorId={speakerId} state="scheming" scale={2} />
      <div className="min-w-0">
        <p className="font-heading text-sm">
          {speakerName}
          {targetName !== undefined && (
            <>
              {' '}
              <span aria-label={`rebuts ${targetName}`} className="text-wax">
                &rarr;
              </span>{' '}
              <span className="text-muted-foreground">{targetName}</span>
            </>
          )}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-base">{text}</p>
      </div>
    </motion.li>
  )
}
