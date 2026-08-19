import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/pixelact-ui/button'
import { Sprite } from '@/components/Sprite'
import type { Audience } from '@/domain/audience'
import { DEFAULT_MONARCH_NAME } from '@/lib/reign'
import { getOrCreateReign, repository } from '@/lib/repository'
import { useRoster } from '@/hooks/useRoster'
import { cn } from '@/lib/utils'

/**
 * `/` (§8) — the throne room, the app's front door. It captures the regnal name
 * (§3, decision §11.9), sends the monarch to hold an audience, and reads back
 * the reign so far: where the court stands in favor, and the last thing decreed.
 * It writes nothing but the name — favor and decrees move only in the chamber.
 */
export function ThroneRoom() {
  const { counselors } = useRoster()
  const [reign, setReign] = useState(() => getOrCreateReign())
  const audiences = useMemo(() => repository.listAudiences(), [])

  const lastDecree = audiences.find((a) => a.decree !== undefined)
  const named = reign.monarchName !== DEFAULT_MONARCH_NAME

  return (
    <main className="min-h-svh bg-background px-6 py-12 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-2 border-b-4 border-ink pb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Speak, I Rule Eventually
          </p>
          <h1 className="font-heading text-4xl sm:text-5xl">SIRE</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            You are the king. They are your counselors. Only you decide.
          </p>
        </header>

        <RegnalName reign={reign} onChange={setReign} />

        <section className="flex flex-col gap-4">
          <p className="font-heading text-xl">
            {named
              ? `The court awaits your word, ${reign.monarchName}.`
              : 'The court awaits your word.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/audience/new">Hold an audience</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/chronicle">The chronicle</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to="/court">The court roster</Link>
            </Button>
          </div>
        </section>

        <FavorSummary
          counselors={counselors}
          favor={reign.favor}
        />

        <LastDecree audience={lastDecree} />
      </div>
    </main>
  )
}

function RegnalName({
  reign,
  onChange,
}: {
  reign: ReturnType<typeof getOrCreateReign>
  onChange: (reign: ReturnType<typeof getOrCreateReign>) => void
}) {
  const [draft, setDraft] = useState(
    reign.monarchName === DEFAULT_MONARCH_NAME ? '' : reign.monarchName,
  )

  function save() {
    const name = draft.trim()
    if (name.length === 0) return
    const next = { ...reign, monarchName: name }
    repository.saveReign(next)
    onChange(next)
  }

  return (
    <section aria-label="Your regnal name" className="flex flex-col gap-2">
      <label htmlFor="regnal-name" className="font-heading text-lg">
        By what name do you reign?
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="regnal-name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              save()
            }
          }}
          maxLength={40}
          placeholder="Rosario the Unbothered"
          className={cn(
            'min-w-0 flex-1 border-4 border-ink bg-card p-3 font-sans text-base text-card-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-4 focus:ring-gold',
          )}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={save}
          disabled={draft.trim().length === 0}
        >
          Take the name
        </Button>
      </div>
    </section>
  )
}

function FavorSummary({
  counselors,
  favor,
}: {
  counselors: readonly { id: string; name: string }[]
  favor: Record<string, number>
}) {
  return (
    <section aria-label="Standing of the court" className="flex flex-col gap-3">
      <h2 className="font-heading text-2xl">The standing of the court</h2>
      <ul className="flex flex-wrap gap-4">
        {counselors.map((counselor) => {
          const value = favor[counselor.id] ?? 0
          const label = value > 0 ? `+${value}` : `${value}`
          return (
            <li
              key={counselor.id}
              className="flex items-center gap-2 border-2 border-stone bg-card px-3 py-2"
            >
              <Sprite
                counselorId={counselor.id}
                name={counselor.name}
                state="neutral"
                scale={2}
              />
              <div className="min-w-0">
                <p className="font-heading text-sm">{counselor.name}</p>
                <p
                  className={cn(
                    'text-xs tabular-nums',
                    value > 0
                      ? 'text-success'
                      : value < 0
                        ? 'text-wax'
                        : 'text-muted-foreground',
                  )}
                >
                  favor {label}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function LastDecree({ audience }: { audience?: Audience }) {
  return (
    <section aria-label="Your last decree" className="flex flex-col gap-2">
      <h2 className="font-heading text-2xl">Your last decree</h2>
      {audience?.decree === undefined ? (
        <p className="text-sm text-muted-foreground">
          You have decreed nothing yet. The crown is still new.
        </p>
      ) : (
        <blockquote className="border-l-4 border-gold pl-3">
          <p className="text-sm text-muted-foreground">{audience.question}</p>
          <p className="mt-1 text-base italic">
            &ldquo;{audience.decree.text}&rdquo;
          </p>
        </blockquote>
      )}
    </section>
  )
}
