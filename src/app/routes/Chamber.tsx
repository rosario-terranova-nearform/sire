import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { PetitionStage } from '@/components/chamber/PetitionStage'
import { DeliberationStage } from '@/components/chamber/DeliberationStage'
import { VoteStage } from '@/components/chamber/VoteStage'
import { DecreeStage } from '@/components/chamber/DecreeStage'
import { AftermathStage } from '@/components/chamber/AftermathStage'
import { ShareScene } from '@/components/chamber/ShareScene'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Audience, Reaction } from '@/domain/audience'
import { applyReactions } from '@/lib/reign'
import { loadOrCreateReign, saveReign } from '@/lib/reign-store'
import { buildSceneSnapshot } from '@/lib/share-scene'
import { useChamber } from '@/hooks/useChamber'

/**
 * §8 / §8.1 — the chamber, at `/audience/:id`. One continuous vertical scene:
 * the matter, the petitions (§5.3, T-17), the floor (§5.4, T-18), then a hold
 * where the tally and decree will land (§5.5–5.7, T-19/T-20).
 *
 * The audience is handed in via router state by the seating screen. A cold
 * arrival — a reload, a shared link — has no such state; rather than a blank or
 * a crash, the court has simply risen, and the monarch is sent to seat a new
 * one. (Resuming a persisted audience is T-21/T-25.)
 */
export function Chamber() {
  const { id } = useParams()
  const location = useLocation()
  const audience = readAudience(location.state)

  if (audience === null || audience.id !== id) {
    return <CourtRisen />
  }

  return <ChamberScene audience={audience} />
}

function ChamberScene({ audience }: { audience: Audience }) {
  // The one permanent reign (§3): loaded once, moved only when the aftermath
  // shifts favor, and persisted so it survives a reload (T-20).
  const [reign, setReign] = useState(loadOrCreateReign)

  const onAftermath = useCallback((reactions: readonly Reaction[]) => {
    setReign((prev) => applyReactions(prev, reactions))
  }, [])

  // Persist outside render whenever the reign moves. The initial load is
  // already on disk (`loadOrCreateReign` wrote it), so this is a no-op until
  // favor changes — then it commits the new standings.
  useEffect(() => {
    saveReign(reign)
  }, [reign])

  const {
    petitions,
    turns,
    activeSpeaker,
    phase,
    votes,
    tally,
    reactions,
    issueDecree,
    audience: live,
  } = useChamber({
    initialAudience: audience,
    reign,
    onAftermath,
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
            onIssue={issueDecree}
            disabled={phase !== 'decree'}
          />
        )}

        {showAftermath && (
          <AftermathStage reactions={reactions} loading={phase === 'reacting'} />
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
