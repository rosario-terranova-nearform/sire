import { useCallback, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { LiveLog } from '@/components/a11y/LiveLog'
import { PetitionStage } from '@/components/chamber/PetitionStage'
import { DeliberationStage } from '@/components/chamber/DeliberationStage'
import { VoteStage } from '@/components/chamber/VoteStage'
import { DecreeStage } from '@/components/chamber/DecreeStage'
import { AftermathStage } from '@/components/chamber/AftermathStage'
import { ShareScene } from '@/components/chamber/ShareScene'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Audience, Reaction } from '@/domain/audience'
import { commitAudience } from '@/lib/reign'
import { getOrCreateReign, repository } from '@/lib/repository'
import { buildSceneSnapshot } from '@/lib/share-scene'
import { useChamber } from '@/hooks/useChamber'
import { useRoster } from '@/hooks/useRoster'

/**
 * §8 / §8.1 — the chamber, at `/audience/:id`. One continuous vertical scene:
 * the matter, the petitions (§5.3, T-17), the floor (§5.4, T-18), then a hold
 * where the tally and decree will land (§5.5–5.7, T-19/T-20).
 *
 * The audience is handed in via router state by the seating screen. A cold
 * arrival — a reload, a shared link — has no such state; T-25 then falls back to
 * the persisted checkpoint, so an audience abandoned at the decree hold (or a
 * finished one) resumes rather than raising the court. Only when nothing is
 * found — a truly unknown id, or an audience left mid-stream, whose live streams
 * cannot be replayed — does the court rise and the monarch seat a new council.
 */
export function Chamber() {
  const { id } = useParams()
  const location = useLocation()
  const fromState = readAudience(location.state)

  const audience = useMemo(() => {
    if (fromState !== null && fromState.id === id) return fromState
    if (id === undefined) return null
    return repository.getAudience(id)
  }, [fromState, id])

  if (audience === null) {
    return <CourtRisen />
  }

  return <ChamberScene audience={audience} />
}

function ChamberScene({ audience }: { audience: Audience }) {
  // The one permanent reign (§3): loaded once, moved only when the aftermath
  // commits, and persisted so it survives a reload (T-20/T-23).
  const [reign, setReign] = useState(() => getOrCreateReign())
  // Agendas that unmasked *this* audience, so the aftermath can flip exactly
  // them open and no others (§3, T-23).
  const [newlyRevealed, setNewlyRevealed] = useState<string[]>([])
  // The live court, so a custom counselor seated at this audience resolves to a
  // real definition through the whole AI chain rather than an unknown id (T-21).
  const roster = useRoster()

  // §3 / §5.7 / T-23 — one commit when the court rises: fold the aftermath's
  // favor, bump each speaker's heard count (unmasking agendas at the threshold),
  // append the decree to memory, persist the reign, and archive the audience for
  // the chronicle. Fires once, from the hook's aftermath step — not a render
  // effect. `reign` here is the loaded reign; this commit is its first move.
  const onAftermath = useCallback(
    (finished: Audience, reactions: readonly Reaction[]) => {
      const { reign: next, newlyRevealed: revealed } = commitAudience(
        reign,
        finished,
        reactions,
      )
      setReign(next)
      setNewlyRevealed(revealed)
      repository.saveReign(next)
      repository.saveAudience(finished)
    },
    [reign],
  )

  // T-25 — persist the decree-hold checkpoint so a reload resumes here.
  const onReachDecree = useCallback((held: Audience) => {
    repository.saveAudience(held)
  }, [])

  const {
    petitions,
    turns,
    activeSpeaker,
    phase,
    votes,
    tally,
    reactions,
    announcements,
    issueDecree,
    audience: live,
  } = useChamber({
    initialAudience: audience,
    reign,
    roster: roster.byId,
    onAftermath,
    onReachDecree,
  })

  const showDeliberation = phase !== 'petition'
  const showVote =
    phase === 'tallying' ||
    phase === 'decree' ||
    phase === 'reacting' ||
    phase === 'aftermath'
  const showDecree =
    phase === 'decree' || phase === 'reacting' || phase === 'aftermath'
  const showAftermath = phase === 'reacting' || phase === 'aftermath'

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <DemoModeBanner />
        <LiveLog messages={announcements} label="Court transcript" />

        <header className="border-4 border-ink bg-card p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            The matter before the court
          </p>
          <h1 className="mt-2 font-heading text-2xl sm:text-3xl">
            {audience.question}
          </h1>
        </header>

        <PetitionStage petitions={petitions} />

        {showDeliberation && (
          <DeliberationStage turns={turns} activeSpeaker={activeSpeaker} />
        )}

        {showVote && (
          <VoteStage
            votes={votes}
            tally={tally}
            seated={audience.seated}
            loading={phase === 'tallying'}
          />
        )}

        {showDecree && (
          <DecreeStage
            seated={audience.seated}
            roster={roster.byId}
            onIssue={issueDecree}
            disabled={phase !== 'decree'}
            issued={live.decree}
          />
        )}

        {showAftermath && (
          <AftermathStage
            reactions={reactions}
            loading={phase === 'reacting'}
            roster={roster.byId}
            newlyRevealed={newlyRevealed}
          />
        )}

        {phase === 'aftermath' && live.decree !== undefined && (
          <section
            aria-label="Share"
            className="border-t-4 border-ink pt-6"
          >
            <p className="mb-3 font-heading text-lg">The court is adjourned.</p>
            <ShareScene snapshot={buildSceneSnapshot(live, reign)} />
          </section>
        )}
      </div>
    </main>
  )
}

function CourtRisen() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="font-heading text-3xl">The court has risen</h1>
        <p className="text-sm text-muted-foreground">
          This audience is no longer in session. Seat a new council to seek
          counsel again.
        </p>
      </div>
      <Button asChild>
        <Link to="/audience/new">Seek an audience</Link>
      </Button>
    </main>
  )
}

/** Router state is untyped; take only a well-formed audience, else nothing. */
function readAudience(state: unknown): Audience | null {
  if (typeof state !== 'object' || state === null) return null
  const candidate = (state as { audience?: unknown }).audience
  if (typeof candidate !== 'object' || candidate === null) return null
  const audience = candidate as Audience
  if (typeof audience.id !== 'string') return null
  if (!Array.isArray(audience.seated)) return null
  return audience
}
