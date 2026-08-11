import { useState } from 'react'
import { AdjournmentCard } from '@/components/AdjournmentCard'
import { CounselorCard } from '@/components/CounselorCard'
import { QuestionComposer } from '@/components/QuestionComposer'
import { Button } from '@/components/ui/pixelact-ui/button'
import { COUNSELORS } from '@/content/counselors'
import type { Audience } from '@/domain/audience'
import { audienceReducer, createAudience } from '@/engine/audience-machine'
import { screenQuestion } from '@/lib/crisis'

/**
 * `/audience/new` (§8) — the two-step approach to the chamber.
 *
 * T-15 builds step 1: the question composer, gated by the crisis screen (§9).
 * A safe question advances the machine `composing → seating` and reveals the
 * council; a flagged one shows the adjournment card and the machine does not
 * move. Step 2's real seating flow — 3–5 selection, faction-clash hints,
 * persistence, and the hand-off to the chamber — is T-16, which replaces the
 * read-only grid revealed here.
 */

const freshAudience = (question = ''): Audience =>
  createAudience({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    question,
  })

export function AudienceNew() {
  const [audience, setAudience] = useState<Audience>(() => freshAudience())
  const [adjourned, setAdjourned] = useState(false)

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
          <SeatingReveal audience={audience} onEditQuestion={editQuestion} />
        )}
      </div>
    </main>
  )
}

/**
 * Step 2's placeholder: the council, revealed. T-16 turns this into the real
 * seating screen (selection, clash hints, persistence, chamber hand-off); for
 * now it proves the machine reached `seating` and surfaces the whole roster.
 */
function SeatingReveal({
  audience,
  onEditQuestion,
}: {
  audience: Audience
  onEditQuestion: () => void
}) {
  return (
    <section className="flex flex-col gap-6" aria-label="Seating">
      <div className="flex flex-wrap items-start justify-between gap-4 border-4 border-gold bg-card p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            The matter before the court
          </p>
          <p className="mt-1 font-heading text-xl">{audience.question}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onEditQuestion}>
          Change the question
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COUNSELORS.map((counselor) => (
          <CounselorCard
            key={counselor.id}
            counselor={counselor}
            variant="compact"
          />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Choosing and seating the council is the next step (T-16).
      </p>
    </section>
  )
}
