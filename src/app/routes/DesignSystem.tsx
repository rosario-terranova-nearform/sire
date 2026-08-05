import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/pixelact-ui/card'
import { Badge } from '@/components/ui/pixelact-ui/badge'
import { Input } from '@/components/ui/pixelact-ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/pixelact-ui/dialog'
import { Progress } from '@/components/ui/pixelact-ui/progress'
import { Sprite } from '@/components/Sprite'
import { SPRITE_FRAME_ORDER } from '@/lib/sprite'

const SEALS = [
  {
    token: 'parchment',
    hex: '#e8d9ae',
    note: 'Court by day — every surface, every scroll.',
  },
  {
    token: 'ink',
    hex: '#241c13',
    note: 'Court by night — and every word written on parchment.',
  },
  {
    token: 'wax',
    hex: '#7e2430',
    note: 'The seal itself. Decrees, denials, destructive acts.',
  },
  {
    token: 'gold',
    hex: '#b8863b',
    note: 'What the Keeper counts. Warnings, rings, focus.',
  },
  {
    token: 'stone',
    hex: '#6e6a5e',
    note: 'The chamber walls. Borders, dividers, what fades.',
  },
] as const

const FACTIONS = [
  'martial',
  'coin',
  'fool',
  'temple',
  'whispers',
  'commons',
] as const

// The seed council's ids (spec §4). Placeholder sheets only — real
// character art swaps in later without touching <Sprite> (T-04).
const COUNSELOR_IDS = ['vane', 'marrow', 'grin', 'verity', 'wren', 'hob']

/**
 * A pixel crown drawn on an 8x8 grid, crisp at any integer zoom.
 * Stands in for real sprite art (T-04) to prove the scale utilities work.
 */
function CrownGlyph({ className }: { className?: string }) {
  const px = [
    [1, 0],
    [1, 1],
    [3, 0],
    [3, 1],
    [5, 0],
    [5, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 3],
    [1, 4],
    [5, 4],
  ]
  return (
    <svg
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <rect width="8" height="8" fill="var(--card)" />
      {px.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="1"
          height="1"
          fill="var(--gold)"
        />
      ))}
    </svg>
  )
}

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

function Seal({ token, hex, note }: (typeof SEALS)[number]) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-fit">
        <div
          className="size-24 border-4 border-ink"
          style={{ backgroundColor: `var(--${token})` }}
        />
        <div
          className="absolute -bottom-3 left-1/2 h-4 w-4 -translate-x-1/2 border-4 border-ink"
          style={{ backgroundColor: `var(--${token})` }}
        />
      </div>
      <div className="mt-2">
        <p className="font-heading text-base uppercase text-foreground">
          {token}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{hex}</p>
        <p className="mt-1 max-w-40 text-xs text-muted-foreground">{note}</p>
      </div>
    </div>
  )
}

export function DesignSystem() {
  const [question, setQuestion] = useState('')
  const [mood, setMood] = useState<(typeof SPRITE_FRAME_ORDER)[number]>(
    'neutral',
  )

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-16">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              The Court Ledger
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Design-system specimen for T-02 (Pixelact UI) and T-03 (the pixel
              token system). Not part of the court itself — a scratch page for
              verifying borders, palette, and type in both light and dark.
            </p>
          </div>
          <ThemeToggle />
        </header>

        {/* Palette */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              The Five Seals
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every hue in the court is one of these five. Everything else (card
              surfaces, borders, focus rings) is mixed from them, never invented
              separately.
            </p>
          </div>
          <div className="flex flex-wrap gap-8">
            {SEALS.map((seal) => (
              <Seal key={seal.token} {...seal} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            One functional colour lives outside the five: a mossy court-green
            for favor and vote feedback, since a status colour isn&apos;t part
            of the court&apos;s identity.
          </p>
        </section>

        {/* Typography */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="font-heading text-xl text-foreground">Two Hands</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pixelify Sans announces. IBM Plex Sans explains. The bitmap face
              never drops below 16px — every row below is annotated with its
              size so that floor is easy to check.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-4 border-ink bg-card p-6">
            <p className="font-heading text-4xl leading-tight text-foreground">
              Hear Ye, Sire — 32px
            </p>
            <p className="font-heading text-2xl text-foreground">
              Lord Marshal Vane — 24px
            </p>
            <p className="font-heading text-lg text-foreground">
              Mistress of Coin — 18px
            </p>
            <p className="font-heading text-base text-foreground">
              Hold Audience — 16px, the floor for the bitmap face
            </p>
          </div>

          <div className="flex flex-col gap-3 border-4 border-stone bg-card p-6">
            <p className="text-base text-foreground">
              &ldquo;Six more months of war and the treasury sees daylight
              again. Any less and you&apos;re asking me to invent coin,
              sire.&rdquo; — body copy, 16px, IBM Plex Sans
            </p>
            <p className="text-sm text-muted-foreground">
              Rationale text and captions sit at 14px — still sans, still
              legible, just quieter.
            </p>
            <p className="text-xs text-muted-foreground">
              And a vote tally&apos;s fine print can go as small as 12px,
              because it was never asked to carry the bitmap face.
            </p>
          </div>
        </section>

        {/* Components */}
        <section className="flex flex-col gap-8">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              The Chamber Fittings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pixelact UI components, re-themed to the five seals above.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Buttons</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Hold Audience</Button>
              <Button variant="secondary">Seat the Council</Button>
              <Button variant="success">So Be It</Button>
              <Button variant="warning">I Will Think On It</Button>
              <Button variant="destructive">Denied</Button>
              <Button variant="link">Read the Chronicle</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Faction badges (§3 — no two seated counselors share one)
            </p>
            <div className="flex flex-wrap gap-2">
              {FACTIONS.map((f) => (
                <Badge key={f} variant="outline">
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <Card className="w-72">
              <CardHeader>
                <CardTitle>Keeper Marrow</CardTitle>
                <CardDescription>Mistress of Coin</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground">
                  &ldquo;Glory doesn&apos;t audit. I do. Fund the campaign and
                  I&apos;ll show you the exact month it bankrupts you.&rdquo;
                </p>
              </CardContent>
              <CardFooter className="flex flex-col items-start gap-2">
                <p className="text-xs text-muted-foreground">Favor: Marrow</p>
                <Progress value={65} />
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="question"
                  className="text-sm text-muted-foreground"
                >
                  Question composer
                </label>
                <Input
                  id="question"
                  placeholder="Ask your question, sire…"
                  value={question}
                  maxLength={300}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-64"
                />
                <p className="text-xs text-muted-foreground">
                  {question.length} / 300
                </p>
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm">
                    Open the Privy Council
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>A Word in Private</DialogTitle>
                    <DialogDescription>
                      Wren leans in. &ldquo;Before you rule, sire — there is one
                      more thing you should know.&rdquo;
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="secondary" size="sm">
                      Hear Her Out
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Favor, three ways
                </p>
                <Progress value={20} />
                <Progress value={55} />
                <Progress value={90} />
              </div>
            </div>
          </div>
        </section>

        {/* Integer scale */}
        <section className="flex flex-col gap-6 border-t-4 border-ink pt-10">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              Fixed to the Grid
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Sprites are authored at 32×32 and rendered only at integer zoom —
              ×2, ×3, ×4. Never fractional. The crown below is an 8×8
              placeholder glyph, not real sprite art (that&apos;s T-04), just
              proving the scale utilities hold their edges.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <CrownGlyph className="pixelated size-8" />
              <p className="text-xs text-muted-foreground">1x · 32px</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <CrownGlyph className="sprite-2x" />
              <p className="text-xs text-muted-foreground">sprite-2x · 64px</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <CrownGlyph className="sprite-3x" />
              <p className="text-xs text-muted-foreground">sprite-3x · 96px</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <CrownGlyph className="sprite-4x" />
              <p className="text-xs text-muted-foreground">sprite-4x · 128px</p>
            </div>
          </div>
        </section>

        {/* Sprites */}
        <section className="flex flex-col gap-6 border-t-4 border-ink pt-10">
          <div>
            <h2 className="font-heading text-xl text-foreground">
              The Placeholder Court
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Programmatically generated 32×32 sheets (T-04) — flat-color
              geometric blocks, not finished character art. Four frames per
              counselor (neutral, pleased, appalled, scheming), read via{' '}
              <code className="text-xs">background-position</code> steps on a
              single element, never a per-frame <code className="text-xs">
                &lt;img&gt;
              </code>{' '}
              swap.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              No layout shift on state change — the box below holds its size
              across every mood.
            </p>
            <div className="flex items-end gap-6">
              <div className="border-4 border-dashed border-stone p-2">
                <Sprite counselorId="vane" state={mood} scale={4} />
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
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              All six counselors × four moods, at ×2 and ×4.
            </p>
            <div className="grid grid-cols-[repeat(4,auto)] items-end gap-x-8 gap-y-6 overflow-x-auto">
              {COUNSELOR_IDS.map((id) =>
                SPRITE_FRAME_ORDER.map((state) => (
                  <div
                    key={`${id}-${state}`}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="flex items-end gap-2">
                      <Sprite counselorId={id} state={state} scale={2} />
                      <Sprite counselorId={id} state={state} scale={4} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {id} · {state}
                    </p>
                  </div>
                )),
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
