import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import { Badge } from '@/components/ui/pixelact-ui/badge'
import { Input } from '@/components/ui/pixelact-ui/input'
import { Sprite } from '@/components/Sprite'
import { COUNSELORS, COUNSELORS_BY_ID } from '@/content/counselors'
import {
  MAX_QUESTION_LENGTH,
  MAX_SEATED,
  MIN_SEATED,
  STAGES,
  type Audience,
} from '@/domain/audience'
import type { SpriteState } from '@/domain/counselor'
import {
  audienceReducer,
  canAdvance,
  createAudience,
  resolveSpeakingOrder,
  type AudienceAction,
} from '@/engine/audience-machine'

/**
 * Scratch harness for T-07 — drive the stage engine by hand and watch it
 * accept or reject each action. Not part of the court's own navigation, and
 * not a preview of the real chamber (that is T-17 onward): every button here
 * dispatches a reducer action with canned text, so the engine can be
 * verified end-to-end before any AI or UI work exists.
 */

interface LogEntry {
  label: string
  rejected: boolean
}

const newAudience = () =>
  createAudience({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  })

const MOODS: readonly SpriteState[] = [
  'pleased',
  'appalled',
  'scheming',
  'neutral',
]

export function EngineScratch() {
  const [audience, setAudience] = useState<Audience>(newAudience)
  const [log, setLog] = useState<LogEntry[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [decreeText, setDecreeText] = useState(
    'The levy stands. The tax does not.',
  )

  const { stage, seated } = audience
  const ready = canAdvance(audience)

  function run(label: string, action: AudienceAction) {
    const next = audienceReducer(audience, action)
    setLog((prev) =>
      [{ label, rejected: next === audience }, ...prev].slice(0, 40),
    )
    setAudience(next)
  }

  function reset() {
    setAudience(newAudience())
    setLog([])
    setPicked([])
    setOrder([])
  }

  function togglePicked(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  /** The next counselor in speaking order who has not yet had a turn. */
  const spoken = new Set(audience.deliberation.map((e) => e.counselorId))
  const upNext = order.find((id) => !spoken.has(id))

  function streamPetition(counselorId: string) {
    const counselor = COUNSELORS_BY_ID[counselorId]
    const already = audience.petitions.find(
      (p) => p.counselorId === counselorId,
    )
    const lineIndex = already?.text ? 1 : 0
    const line = counselor.voice.sampleLines[lineIndex]
    run(`petition-chunk · ${counselorId}`, {
      type: 'petition-chunk',
      counselorId,
      text: (already?.text ? ' ' : '') + line,
    })
  }

  // A clear winner: everyone backs the first seat, which backs the second.
  const decisiveTally = seated.map((id, i) => ({
    voterId: id,
    forId: i === 0 ? seated[1] : seated[0],
    rationale: 'Least ruinous of the counsels offered.',
  }))

  // A cycle: one vote each, so the council hangs and stays hung (§5.5).
  const hungTally = seated.map((id, i) => ({
    voterId: id,
    forId: seated[(i + 1) % seated.length],
    rationale: 'The council splits.',
  }))

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl text-foreground sm:text-4xl">
              The Engine Room
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Scratch harness for T-07. Every button dispatches one reducer
              action with canned text. An action the engine refuses leaves the
              transcript untouched and is marked{' '}
              <span className="text-wax">REJECTED</span> in the log — that is
              the whole contract.
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              The amber <span className="text-gold">Try…</span> buttons are
              negative tests, not features. Nothing in the real court will ever
              offer them: they fire actions the engine must refuse, because the
              same malformed input can arrive from model output (§6.4) or a
              restored transcript, where no button is involved.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={reset}>
            New Audience
          </Button>
        </header>

        {/* Stage rail — sticky, so Advance stays reachable down a long page. */}
        <section className="sticky top-0 z-10 -mx-2 flex flex-col gap-3 border-b-4 border-stone bg-background px-2 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {STAGES.map((s) => (
              <Badge key={s} variant={s === stage ? 'default' : 'outline'}>
                {s}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant={ready ? 'success' : 'secondary'}
              disabled={!ready}
              onClick={() => run('advance', { type: 'advance' })}
            >
              Advance
            </Button>
            <p className="text-sm text-muted-foreground">
              canAdvance:{' '}
              <span className={ready ? 'text-foreground' : 'text-wax'}>
                {String(ready)}
              </span>
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run('advance (forced)', { type: 'advance' })}
            >
              Try to advance anyway
            </Button>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-8">
            {/* Composing */}
            <Panel
              title="1 · Composing"
              active={stage === 'composing'}
              note={`Free text, 1–${MAX_QUESTION_LENGTH} chars. Actions dispatched outside this stage are refused.`}
            >
              <Input
                value={audience.question}
                placeholder="Ask your question, sire…"
                onChange={(e) =>
                  run('set-question', {
                    type: 'set-question',
                    question: e.target.value,
                  })
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {audience.question.length} / {MAX_QUESTION_LENGTH}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run('set-question (example)', {
                      type: 'set-question',
                      question: 'Should we march on Harrow before the thaw?',
                    })
                  }
                >
                  Use an example
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() =>
                    run('set-question (301 chars)', {
                      type: 'set-question',
                      question: 'a'.repeat(301),
                    })
                  }
                >
                  Try 301 chars
                </Button>
              </div>
            </Panel>

            {/* Seating */}
            <Panel
              title="2 · Seating"
              active={stage === 'seating'}
              note={`${MIN_SEATED}–${MAX_SEATED} counselors. The engine refuses a council outside that range, or one with duplicates.`}
            >
              <div className="flex flex-wrap gap-3">
                {COUNSELORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={picked.includes(c.id)}
                    aria-label={`${c.name}, ${c.title}`}
                    onClick={() => togglePicked(c.id)}
                    className={`flex items-center gap-3 border-4 p-2 text-left ${
                      picked.includes(c.id)
                        ? 'border-gold bg-card'
                        : 'border-stone'
                    }`}
                  >
                    <Sprite counselorId={c.id} state="neutral" scale={2} />
                    <span>
                      <span className="block font-heading text-base">
                        {c.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.title} · {c.faction}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  onClick={() =>
                    run(`seat-council (${picked.length})`, {
                      type: 'seat-council',
                      seated: picked,
                    })
                  }
                >
                  Seat the {picked.length} chosen
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() =>
                    run('seat-council (duplicate)', {
                      type: 'seat-council',
                      seated: ['vane', 'vane', 'hob'],
                    })
                  }
                >
                  Try a duplicate council
                </Button>
                <p className="text-xs text-muted-foreground">
                  seated: {seated.join(', ') || '—'}
                </p>
              </div>
            </Panel>

            {/* Petition */}
            <Panel
              title="3 · Petition"
              active={stage === 'petition'}
              note="Streams arrive independently and in any order. The stage completes only once every seated counselor's stream has closed."
            >
              <div className="flex flex-col gap-3">
                {seated.map((id) => {
                  const petition = audience.petitions.find(
                    (p) => p.counselorId === id,
                  )
                  return (
                    <div key={id} className="flex items-start gap-3">
                      <Sprite counselorId={id} state="neutral" scale={2} />
                      <div className="min-w-0 flex-1">
                        <p className="font-heading text-base">
                          {COUNSELORS_BY_ID[id].name}{' '}
                          {petition?.complete ? (
                            <span className="text-xs text-muted-foreground">
                              (stream closed)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {petition?.text || '…'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => streamPetition(id)}
                        >
                          Chunk
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            run(`petition-complete · ${id}`, {
                              type: 'petition-complete',
                              counselorId: id,
                            })
                          }
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button
                size="sm"
                variant="warning"
                onClick={() =>
                  run('petition-chunk · unseated', {
                    type: 'petition-chunk',
                    counselorId: 'nobody',
                    text: 'I was not invited.',
                  })
                }
              >
                Try a chunk from an unseated counselor
              </Button>
            </Panel>

            {/* Deliberation */}
            <Panel
              title="4 · Deliberation"
              active={stage === 'deliberation'}
              note="Shuffle the order and watch Wren land last every time — she is the only speaks-last counselor on the roster."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setOrder(resolveSpeakingOrder(seated, COUNSELORS_BY_ID))
                  }
                >
                  Resolve speaking order
                </Button>
                <p className="text-xs text-muted-foreground">
                  {order.length > 0 ? order.join(' → ') : 'not resolved yet'}
                </p>
              </div>

              <Button
                size="sm"
                disabled={upNext === undefined}
                onClick={() => {
                  if (upNext === undefined) return
                  const target = order.find((id) => id !== upNext) ?? seated[0]
                  run(`add-exchange · ${upNext} → ${target}`, {
                    type: 'add-exchange',
                    exchange: {
                      counselorId: upNext,
                      targetId: target,
                      text: `${COUNSELORS_BY_ID[upNext].voice.sampleLines[0]}`,
                    },
                  })
                }}
              >
                {upNext ? `Next turn: ${upNext}` : 'Every seat has spoken'}
              </Button>

              <ol className="flex flex-col gap-2">
                {audience.deliberation.map((e) => (
                  <li key={e.order} className="flex items-start gap-3">
                    <Sprite
                      counselorId={e.counselorId}
                      state="scheming"
                      scale={2}
                    />
                    <p className="text-sm">
                      <span className="font-heading text-base">
                        {COUNSELORS_BY_ID[e.counselorId].name}
                      </span>{' '}
                      <span className="text-xs text-muted-foreground">
                        → {COUNSELORS_BY_ID[e.targetId].name} (order {e.order})
                      </span>
                      <br />
                      <span className="text-muted-foreground">{e.text}</span>
                    </p>
                  </li>
                ))}
              </ol>

              <Button
                size="sm"
                variant="warning"
                onClick={() =>
                  run('add-exchange · self-rebuttal', {
                    type: 'add-exchange',
                    exchange: {
                      counselorId: seated[0],
                      targetId: seated[0],
                      text: 'I dispute myself.',
                    },
                  })
                }
              >
                Try rebutting yourself
              </Button>
            </Panel>

            {/* Vote */}
            <Panel
              title="5 · Vote"
              active={stage === 'vote'}
              note="A tie is kept as a hung council, not resolved. A tally with a self-vote, a missing voter, or an unseated id is refused whole."
            >
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    run('record-votes (valid)', {
                      type: 'record-votes',
                      votes: decisiveTally,
                    })
                  }
                >
                  Record a clean tally
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    run('record-votes (hung)', {
                      type: 'record-votes',
                      votes: hungTally,
                    })
                  }
                >
                  Record a hung council
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() =>
                    run('record-votes (self-vote)', {
                      type: 'record-votes',
                      votes: decisiveTally.map((v, i) =>
                        i === 0 ? { ...v, forId: v.voterId } : v,
                      ),
                    })
                  }
                >
                  Try a self-vote
                </Button>
              </div>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {audience.votes.map((v) => (
                  <li key={v.voterId}>
                    {COUNSELORS_BY_ID[v.voterId].name} →{' '}
                    {COUNSELORS_BY_ID[v.forId].name}: {v.rationale}
                  </li>
                ))}
              </ul>
            </Panel>

            {/* Decree */}
            <Panel
              title="6 · Decree"
              active={stage === 'decree'}
              note="The monarch rules. Siding with a counselor who was never seated is refused."
            >
              <Input
                value={decreeText}
                onChange={(e) => setDecreeText(e.target.value)}
                className="w-full"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    run('issue-decree', {
                      type: 'issue-decree',
                      decree: {
                        text: decreeText,
                        issuedAt: new Date().toISOString(),
                      },
                    })
                  }
                >
                  Issue the decree
                </Button>
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() =>
                    run('issue-decree (unseated ally)', {
                      type: 'issue-decree',
                      decree: {
                        text: decreeText,
                        sidedWithId: 'nobody',
                        issuedAt: new Date().toISOString(),
                      },
                    })
                  }
                >
                  Try siding with an unseated counselor
                </Button>
              </div>
              {audience.decree ? (
                <p className="text-sm text-muted-foreground">
                  Sealed: {audience.decree.text}
                </p>
              ) : null}
            </Panel>

            {/* Aftermath */}
            <Panel
              title="7 · Aftermath"
              active={stage === 'aftermath'}
              note="One reaction per seated counselor. Reactions from anyone who was not in the room are refused."
            >
              <Button
                size="sm"
                onClick={() =>
                  run('record-reactions', {
                    type: 'record-reactions',
                    reactions: seated.map((id, i) => ({
                      counselorId: id,
                      mood: MOODS[i % MOODS.length],
                      line: 'So it is written, sire.',
                      favorDelta: (i % 3) - 1,
                    })),
                  })
                }
              >
                Record reactions
              </Button>
              <div className="flex flex-wrap gap-4">
                {audience.reactions.map((r) => (
                  <div key={r.counselorId} className="flex items-center gap-2">
                    <Sprite
                      counselorId={r.counselorId}
                      state={r.mood}
                      scale={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      {r.mood} · {r.favorDelta > 0 ? '+' : ''}
                      {r.favorDelta}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Log + state */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <div className="border-4 border-ink bg-card p-4">
              <h2 className="font-heading text-lg">Action log</h2>
              <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
                {log.length === 0 ? (
                  <li className="text-muted-foreground">
                    Nothing dispatched yet.
                  </li>
                ) : null}
                {log.map((entry, i) => (
                  <li key={`${entry.label}-${i}`}>
                    <span
                      className={
                        entry.rejected ? 'text-wax' : 'text-muted-foreground'
                      }
                    >
                      {entry.rejected ? 'REJECTED' : 'applied '}
                    </span>{' '}
                    {entry.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-4 border-stone bg-card p-4">
              <h2 className="font-heading text-lg">Audience</h2>
              <pre className="mt-2 max-h-96 overflow-auto text-[11px] leading-snug text-muted-foreground">
                {JSON.stringify(audience, null, 2)}
              </pre>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function Panel({
  title,
  active,
  note,
  children,
}: {
  title: string
  active: boolean
  note: string
  children: ReactNode
}) {
  return (
    <section
      className={`flex flex-col gap-3 border-4 p-4 ${
        active ? 'border-gold bg-card' : 'border-stone opacity-60'
      }`}
    >
      <div>
        <h2 className="font-heading text-xl">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  )
}
