import { useEffect, useState } from 'react'
import { CounselorCard } from '@/components/CounselorCard'
import { Button } from '@/components/ui/pixelact-ui/button'
import { COUNSELORS } from '@/content/counselors'
import { SPRITE_FRAME_ORDER } from '@/lib/sprite'
import type { SpriteState } from '@/domain/counselor'

/** A spread of favor values (-10 … +10) so the favor bar is visible at a
 *  range of fills across the roster — purely for the specimen. */
const DEMO_FAVOR = [-8, -3, 0, 4, 7, 10]

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])

  return (
    <Button variant="secondary" size="sm" onClick={() => setDark((d) => !d)}>
      {dark ? 'Summon the Day Court' : 'Summon the Night Court'}
    </Button>
  )
}

export function CounselorCardSpecimen() {
  const [revealed, setRevealed] = useState(false)
  const [mood, setMood] = useState<SpriteState>('neutral')

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-16">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              The Counselor Card
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Specimen for T-14 — the app&apos;s signature object (§8.2) in its
              three variants: <code className="text-xs">compact</code>{' '}
              (seating), <code className="text-xs">speaking</code> (petition),
              and <code className="text-xs">full</code> (roster). Toggle to
              check masked vs revealed agendas and both colour modes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={revealed ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? 'Mask the agendas' : 'Reveal the agendas'}
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Compact */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              Compact — the seating grid
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              How the council is scanned and chosen (§5.2, T-16). The Marshal
              below is drawn as already seated.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COUNSELORS.map((counselor, i) => (
              <CounselorCard
                key={counselor.id}
                counselor={counselor}
                variant="compact"
                agendaRevealed={revealed}
                favor={DEMO_FAVOR[i % DEMO_FAVOR.length]}
                selected={counselor.id === 'vane'}
              />
            ))}
          </div>
        </section>

        {/* Speaking */}
        <section className="flex flex-col gap-6 border-t-4 border-ink pt-10">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              Speaking — the petition stage
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Streaming counsel drops into the card body (§5.3–5.4). The last
              card shows the pre-stream in-world placeholder. Cycle the mood to
              see the portrait react.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPRITE_FRAME_ORDER.map((state) => (
              <Button
                key={state}
                size="sm"
                variant={state === mood ? 'default' : 'secondary'}
                onClick={() => setMood(state)}
              >
                {state}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COUNSELORS.map((counselor, i) => (
              <CounselorCard
                key={counselor.id}
                counselor={counselor}
                variant="speaking"
                mood={mood}
                speech={
                  i === COUNSELORS.length - 1
                    ? undefined
                    : counselor.voice.sampleLines[0]
                }
              />
            ))}
          </div>
        </section>

        {/* Full */}
        <section className="flex flex-col gap-6 border-t-4 border-ink pt-10">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              Full — the court roster
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The fullest read (T-16 roster): portrait, stats, ability, agenda,
              voice, and favor.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {COUNSELORS.map((counselor, i) => (
              <CounselorCard
                key={counselor.id}
                counselor={counselor}
                variant="full"
                agendaRevealed={revealed}
                favor={DEMO_FAVOR[i % DEMO_FAVOR.length]}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
