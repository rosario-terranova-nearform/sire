import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { PetitionStage } from '@/components/chamber/PetitionStage'
import { DeliberationStage } from '@/components/chamber/DeliberationStage'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Audience } from '@/domain/audience'
import { createDefaultReign } from '@/lib/reign'
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
  const reign = useMemo(() => createDefaultReign(), [])
  const { petitions, turns, activeSpeaker, phase } = useChamber({
    initialAudience: audience,
    reign,
  })

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

        {(phase === 'deliberation' || phase === 'concluded') && (
          <DeliberationStage turns={turns} activeSpeaker={activeSpeaker} />
        )}

        {phase === 'concluded' && (
          <section
            aria-label="Next"
            className="border-4 border-dashed border-stone p-6 text-center text-muted-foreground"
          >
            <p className="font-heading text-lg text-foreground">
              The council has spoken.
            </p>
            <p className="mt-1 text-sm">
              The tally and your decree are next. (T-19)
            </p>
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
