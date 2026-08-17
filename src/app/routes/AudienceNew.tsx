import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AdjournmentCard } from '@/components/AdjournmentCard'
import { QuestionComposer } from '@/components/QuestionComposer'
import { SeatingBoard } from '@/components/SeatingBoard'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Audience } from '@/domain/audience'
import {
  audienceReducer,
  createAudience,
  isValidCouncil,
} from '@/engine/audience-machine'
import { screenQuestion } from '@/lib/crisis'
import { repository } from '@/lib/repository'
import { filterKnownSeated } from '@/lib/roster'
import { useRoster } from '@/hooks/useRoster'
import { MAX_SEATED } from '@/domain/audience'

/**
 * `/audience/new` (§8) — the two-step approach to the chamber.
 *
 * Step 1 (T-15) is the question composer, gated by the crisis screen (§9): a
 * safe question advances `composing → seating`; a flagged one adjourns and the
 * machine does not move. Step 2 (T-16) is the seating board — 3–5 selection,
 * clash hints, a persisted default — and, on confirm, the machine advances to
 * `petition` and hands the audience to the chamber.
 */

const freshAudience = (question = ''): Audience =>
  createAudience({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    question,
  })

export function AudienceNew() {
  const navigate = useNavigate()
  const roster = useRoster()
  const [audience, setAudience] = useState<Audience>(() => freshAudience())
  const [adjourned, setAdjourned] = useState(false)
  // The seating selection *is* the persisted default: it seeds from the last
  // council and is written back on every change, so it survives a reload (T-16).
  // Filtered to seats that still exist — a counselor dismissed since the store
  // was written must never be pre-seated onto a prompt (T-21).
  const [selected, setSelected] = useState<string[]>(() =>
    filterKnownSeated(repository.getDefaultCouncil(), roster.byId),
  )

  useEffect(() => {
    repository.saveDefaultCouncil(selected)
  }, [selected])

  function handleSubmit(question: string) {
    // §9 — the crisis screen runs before any advance can be reached. On a hit
    // the machine stays in `composing`; nothing downstream is generated.
    if (screenQuestion(question).adjourn) {
      setAdjourned(true)
      return
    }
    setAdjourned(false)
    const withQuestion = audienceReducer(audience, {
      type: 'set-question',
      question,
    })
    setAudience(audienceReducer(withQuestion, { type: 'advance' }))
  }

  function editQuestion() {
    setAdjourned(false)
    setAudience((current) => freshAudience(current.question))
  }

  function toggleSeat(counselorId: string) {
    setSelected((current) => {
      if (current.includes(counselorId)) {
        return current.filter((id) => id !== counselorId)
      }
      // The board keeps unseated cards inert at capacity, but guard here too.
      if (current.length >= MAX_SEATED) return current
      return [...current, counselorId]
    })
  }

  function confirmSeating() {
    if (!isValidCouncil(selected)) return
    // §5.2 — confirming seating transitions the machine to `petition`; the
    // first round of AI calls fires in the chamber (T-17), not here.
    const seated = audienceReducer(audience, {
      type: 'seat-council',
      seated: selected,
    })
    const petitioning = audienceReducer(seated, { type: 'advance' })
    repository.saveDefaultCouncil(selected)
    void navigate(`/audience/${petitioning.id}`, {
      state: { audience: petitioning },
    })
  }

  const composing = audience.stage === 'composing'

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="border-b-4 border-ink pb-6">
          <h1 className="font-heading text-3xl sm:text-4xl">Seek an Audience</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {composing
              ? 'Pose your question to the court. When you are ready, the council will be seated.'
              : 'The council stands ready. Choose who will hear you.'}
          </p>
        </header>

        {composing ? (
          <div className="flex flex-col gap-8">
            {adjourned && <AdjournmentCard />}
            <QuestionComposer
              initialValue={audience.question}
              onSubmit={handleSubmit}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-4 border-gold bg-card p-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  The matter before the court
                </p>
                <p className="mt-1 font-heading text-xl">{audience.question}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={editQuestion}>
                Change the question
              </Button>
            </div>

            <SeatingBoard
              counselors={roster.counselors}
              selected={selected}
              onToggle={toggleSeat}
            />

            <div className="flex items-center gap-4">
              <Button onClick={confirmSeating} disabled={!isValidCouncil(selected)}>
                Convene the council
              </Button>
              {!isValidCouncil(selected) && (
                <span className="text-sm text-muted-foreground">
                  Seat between 3 and 5 counselors.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
