import { useMemo } from 'react'
import { Link } from 'react-router'
import { Sprite } from '@/components/Sprite'
import { Button } from '@/components/ui/pixelact-ui/button'
import type { Audience } from '@/domain/audience'
import type { Counselor } from '@/domain/counselor'
import { AGENDA_REVEAL_AT, MAX_FAVOR, MIN_FAVOR } from '@/domain/reign'
import { getOrCreateReign, repository } from '@/lib/repository'
import { useRoster } from '@/hooks/useRoster'
import { cn } from '@/lib/utils'

/**
 * `/chronicle` (§8, T-23) — the reign read backwards. Three things it keeps:
 * the standing of every counselor (favor, how often they have been heard, and
 * the agenda that unmasks at `AGENDA_REVEAL_AT`), and every decree the monarch
 * has handed down. It reads through the repository and the reign only — it
 * writes nothing, being a record and not a stage.
 */
export function Chronicle() {
  const { counselors } = useRoster()
  // Read once on mount. The chronicle is a snapshot of a reign that only moves
  // inside the chamber, never on this page.
  const reign = useMemo(() => getOrCreateReign(), [])
  const audiences = useMemo(() => repository.listAudiences(), [])

  const decrees = audiences.filter((audience) => audience.decree !== undefined)

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl">The Chronicle</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              The reign of {reign.monarchName} — who stands where, and everything
              you have decreed.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/audience/new">Hold an audience</Link>
          </Button>
        </header>

        <section aria-label="The standing of the court" className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl">The standing of the court</h2>
          <ul className="flex flex-col gap-4">
            {counselors.map((counselor) => (
              <StandingRow
                key={counselor.id}
                counselor={counselor}
                favor={reign.favor[counselor.id] ?? 0}
                heard={reign.heardCount[counselor.id] ?? 0}
                revealed={reign.revealedAgendas.includes(counselor.id)}
              />
            ))}
          </ul>
        </section>

        <section aria-label="Decrees" className="flex flex-col gap-4">
          <h2 className="font-heading text-2xl">The decrees</h2>
          {decrees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have decreed nothing yet. The page is blank, and the crown is
              still new.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {decrees.map((audience) => (
                <DecreeRow key={audience.id} audience={audience} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  )
}

/** Faction favor maps `-10 … +10` onto the 0–100 the bar draws. */
function favorToPercent(favor: number): number {
  const clamped = Math.max(MIN_FAVOR, Math.min(MAX_FAVOR, favor))
  return ((clamped - MIN_FAVOR) / (MAX_FAVOR - MIN_FAVOR)) * 100
}

function StandingRow({
  counselor,
  favor,
  heard,
  revealed,
}: {
  counselor: Counselor
  favor: number
  heard: number
  revealed: boolean
}) {
  const favorLabel = favor > 0 ? `+${favor}` : `${favor}`
  const heardLabel = revealed
    ? `Heard ${heard} times`
    : `Heard ${Math.min(heard, AGENDA_REVEAL_AT)}/${AGENDA_REVEAL_AT}`

  return (
    <li className="flex gap-4 border-2 border-stone bg-card p-4">
      <Sprite
        counselorId={counselor.id}
        name={counselor.name}
        state="neutral"
        scale={3}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading text-lg">{counselor.name}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {counselor.title}
            </p>
          </div>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {heardLabel}
          </span>
        </div>

        {/* Favor as a diverging bar anchored at the centre (0). */}
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
            Favor
          </span>
          <div
            className="relative h-3 flex-1 border-2 border-ink bg-background"
            role="img"
            aria-label={`Favor ${favorLabel} of ${MAX_FAVOR}`}
          >
            <div className="absolute inset-y-0 left-1/2 w-px bg-ink/40" />
            <div
              className={cn(
                'absolute inset-y-0',
                favor >= 0 ? 'bg-gold' : 'bg-wax',
              )}
              style={
                favor >= 0
                  ? { left: '50%', width: `${favorToPercent(favor) - 50}%` }
                  : { right: '50%', width: `${50 - favorToPercent(favor)}%` }
              }
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">
            {favorLabel}
          </span>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Agenda
          </p>
          {revealed ? (
            <p className="text-sm text-foreground">{counselor.agenda}</p>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              AGENDA: ??? (heard {AGENDA_REVEAL_AT} times to unmask)
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function DecreeRow({ audience }: { audience: Audience }) {
  const decree = audience.decree
  if (decree === undefined) return null

  return (
    <li className="border-2 border-stone bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {formatDate(decree.issuedAt)}
      </p>
      <p className="mt-1 font-heading text-lg">{audience.question}</p>
      <p className="mt-2 border-l-4 border-gold pl-3 text-base italic">
        &ldquo;{decree.text}&rdquo;
      </p>
    </li>
  )
}

/** ISO → a plain, local date. A bad string falls back to itself, never throws. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
