import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/pixelact-ui/badge'
import { Button } from '@/components/ui/pixelact-ui/button'
import { Input } from '@/components/ui/pixelact-ui/input'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { Sprite } from '@/components/Sprite'
import {
  requestDeliberationTurn,
  requestPetition,
  requestReactions,
  requestVotes,
} from '@/ai/calls'
import { hasApiKey } from '@/ai/client'
import type { Tally } from '@/ai/sanitize'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { DEMO_QUESTION, DEMO_SEATED } from '@/content/demo-audience'
import {
  MAX_DECREE_LENGTH,
  MAX_QUESTION_LENGTH,
  type Audience,
} from '@/domain/audience'
import type { Reign } from '@/domain/reign'
import {
  audienceReducer,
  createAudience,
  resolveSpeakingOrder,
  type AudienceAction,
} from '@/engine/audience-machine'

/**
 * Scratch harness for Phase 2 (T-08 … T-13) — drives the real AI layer through
 * the real stage engine, live or on tape. Not the chamber: that is T-17 onward.
 *
 * What it proves by hand: petitions stream in parallel, the floor runs in
 * speaking order with `speaks-last` last, the tally survives sanitising, and
 * pulling `VITE_OPENROUTER_API_KEY` turns the whole thing into a playable
 * recording with a banner instead of an error.
 */

const REIGN: Reign = {
  id: 'scratch-reign',
  monarchName: 'Rosario the Unbothered',
  favor: {},
  heardCount: {},
  revealedAgendas: [],
  history: [],
  createdAt: '2026-08-07T09:00:00.000Z',
}

const DEFAULT_DECREE =
  'Let the marriage be made — but the girl is asked first, and the ridge is surveyed before she signs.'

type Phase = 'idle' | 'counsel' | 'awaiting-decree' | 'aftermath'

export function AiScratch() {
  const [question, setQuestion] = useState(DEMO_QUESTION)
  const [decreeText, setDecreeText] = useState(DEFAULT_DECREE)
  const [audience, setAudience] = useState<Audience | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [log, setLog] = useState<string[]>([])
  const [speaking, setSpeaking] = useState<Record<string, string>>({})
  const [tally, setTally] = useState<Tally | null>(null)

  const current = useRef<Audience | null>(null)

  function note(line: string) {
    setLog((prev) => [line, ...prev].slice(0, 60))
  }

  /** Push one action through the engine and mirror the result into React. */
  function push(label: string, action: AudienceAction) {
    const before = current.current
    if (before === null) return

    const after = audienceReducer(before, action)
    // Stage moves and refusals are the interesting events; a chunk is not.
    if (after === before) {
      note(`REFUSED · ${label}`)
    } else if (after.stage !== before.stage) {
      note(`stage → ${after.stage}`)
    }
    current.current = after
    setAudience(after)
  }

  async function holdAudience() {
    setLog([])
    setSpeaking({})
    setTally(null)
    setPhase('counsel')

    const seated = [...DEMO_SEATED]
    current.current = createAudience({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      question,
      seated,
    })
    setAudience(current.current)

    push('advance → seating', { type: 'advance' })
    push('advance → petition', { type: 'advance' })

    // §5.3 — every petition at once, each blind to the others.
    await Promise.all(
      seated.map(async (id) => {
        try {
          const stream = await requestPetition(
            COUNSELORS_BY_ID[id],
            current.current!,
            REIGN,
          )
          note(`petition · ${id} · ${stream.modelId}`)

          for await (const chunk of stream.textStream) {
            push(`petition-chunk · ${id}`, {
              type: 'petition-chunk',
              counselorId: id,
              text: chunk,
            })
          }
        } catch (error) {
          note(`petition failed · ${id} · ${describe(error)}`)
        } finally {
          push(`petition-complete · ${id}`, {
            type: 'petition-complete',
            counselorId: id,
          })
        }
      }),
    )

    push('advance → deliberation', { type: 'advance' })

    // §5.4 — one at a time, shuffled, `speaks-last` at the end.
    for (const id of resolveSpeakingOrder(seated, COUNSELORS_BY_ID)) {
      try {
        const turn = await requestDeliberationTurn(
          COUNSELORS_BY_ID[id],
          current.current!,
          REIGN,
          {
            onChunk: (chunk, { attempt }) =>
              setSpeaking((prev) => ({
                ...prev,
                [id]: attempt === 1 ? (prev[id] ?? '') + chunk : chunk,
              })),
          },
        )

        note(
          `floor · ${id} → ${turn.targetId} · ${turn.modelId} · attempt ${turn.attempts}` +
            (turn.violations.length > 0
              ? ` · kept: ${turn.violations.join(',')}`
              : ''),
        )
        push(`add-exchange · ${id}`, {
          type: 'add-exchange',
          exchange: {
            counselorId: turn.counselorId,
            targetId: turn.targetId,
            text: turn.text,
          },
        })
      } catch (error) {
        note(`floor failed · ${id} · ${describe(error)}`)
      } finally {
        setSpeaking((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }

    push('advance → vote', { type: 'advance' })

    const votes = await requestVotes(current.current!, REIGN)
    note(
      `tally · ${votes.modelId}` +
        (votes.repaired ? ' · repaired' : '') +
        (votes.filled.length > 0 ? ` · filled ${votes.filled.join(',')}` : '') +
        (votes.tally.hung
          ? ' · HUNG'
          : ` · leads: ${votes.tally.leaders.join(',')}`),
    )
    setTally(votes.tally)
    push('record-votes', { type: 'record-votes', votes: votes.votes })

    push('advance → decree', { type: 'advance' })
    setPhase('awaiting-decree')
  }

  async function issueDecree() {
    setPhase('aftermath')

    push('issue-decree', {
      type: 'issue-decree',
      decree: { text: decreeText, issuedAt: new Date().toISOString() },
    })
    push('advance → aftermath', { type: 'advance' })

    const reactions = await requestReactions(current.current!, REIGN)
    note(
      `reactions · ${reactions.modelId}` +
        (reactions.repaired ? ' · repaired' : '') +
        (reactions.filled.length > 0
          ? ` · silent: ${reactions.filled.join(',')}`
          : ''),
    )
    push('record-reactions', {
      type: 'record-reactions',
      reactions: reactions.reactions,
    })
  }

  const busy = phase === 'counsel' || phase === 'aftermath'

  return (
    <main className="min-h-svh bg-background px-6 py-10 text-foreground sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b-4 border-ink pb-6">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl">
              The Antechamber
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Scratch harness for Phase 2. One real audience, driven through the
              real AI layer and the real reducer. Key present:{' '}
              <span className={hasApiKey() ? 'text-foreground' : 'text-wax'}>
                {String(hasApiKey())}
              </span>
              .
            </p>
          </div>

          <DemoModeBanner />

          <div className="flex flex-col gap-2">
            <Input
              value={question}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(event) => setQuestion(event.target.value)}
              className="w-full"
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={holdAudience} disabled={busy}>
                {phase === 'idle' ? 'Hold an audience' : 'Hold another'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {audience === null ? 'no audience' : `stage: ${audience.stage}`}
              </span>
            </div>
          </div>
        </header>

        {audience !== null && (
          <>
            <Section title="Petitions (§5.3)">
              <div className="grid gap-4 sm:grid-cols-2">
                {audience.seated.map((id) => {
                  const petition = audience.petitions.find(
                    (entry) => entry.counselorId === id,
                  )
                  return (
                    <article
                      key={id}
                      className="flex gap-3 border-4 border-stone bg-card p-3"
                    >
                      <Sprite counselorId={id} state="neutral" scale={2} />
                      <div className="min-w-0">
                        <p className="font-heading text-sm">
                          {COUNSELORS_BY_ID[id].name}
                        </p>
                        <p className="mt-1 text-sm">
                          {petition?.text ??
                            `${COUNSELORS_BY_ID[id].name} clears their throat…`}
                        </p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </Section>

            <Section title="The floor (§5.4)">
              <ol className="flex flex-col gap-3">
                {audience.deliberation.map((exchange) => (
                  <li
                    key={exchange.order}
                    className="flex gap-3 border-b-2 border-stone pb-3"
                  >
                    <Sprite
                      counselorId={exchange.counselorId}
                      state="scheming"
                      scale={2}
                    />
                    <div className="min-w-0">
                      <p className="font-heading text-sm">
                        {COUNSELORS_BY_ID[exchange.counselorId].name}{' '}
                        <span className="text-wax">→</span>{' '}
                        {COUNSELORS_BY_ID[exchange.targetId]?.name}
                      </p>
                      <p className="mt-1 text-sm">{exchange.text}</p>
                    </div>
                  </li>
                ))}
                {Object.entries(speaking).map(([id, text]) => (
                  <li
                    key={`live-${id}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span className="font-heading">
                      {COUNSELORS_BY_ID[id].name} is speaking…
                    </span>{' '}
                    {text}
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="The tally (§5.5) — the council's preference, not the answer">
              {tally !== null && (
                <p className="mb-3 text-sm">
                  {tally.hung ? (
                    <span className="text-wax">
                      A hung council. No preference is declared.
                    </span>
                  ) : (
                    <>
                      Leading:{' '}
                      {tally.leaders
                        .map((id) => COUNSELORS_BY_ID[id].name)
                        .join(', ')}
                    </>
                  )}
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {audience.votes.map((vote) => (
                  <li key={vote.voterId} className="text-sm">
                    <span className="font-heading">
                      {COUNSELORS_BY_ID[vote.voterId].name}
                    </span>{' '}
                    backs {COUNSELORS_BY_ID[vote.forId]?.name} —{' '}
                    <span className="text-muted-foreground">
                      “{vote.rationale}”
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {(phase === 'awaiting-decree' || phase === 'aftermath') && (
              <Section title="The decree (§5.6) — yours, not theirs">
                <Input
                  value={decreeText}
                  maxLength={MAX_DECREE_LENGTH}
                  onChange={(event) => setDecreeText(event.target.value)}
                  className="w-full"
                  disabled={phase === 'aftermath'}
                />
                <Button
                  className="mt-3"
                  variant="destructive"
                  onClick={issueDecree}
                  disabled={phase !== 'awaiting-decree'}
                >
                  Seal it
                </Button>
              </Section>
            )}

            {audience.reactions.length > 0 && (
              <Section title="Aftermath (§5.7)">
                <ul className="flex flex-col gap-3">
                  {audience.reactions.map((reaction) => (
                    <li key={reaction.counselorId} className="flex gap-3">
                      <Sprite
                        counselorId={reaction.counselorId}
                        state={reaction.mood}
                        scale={2}
                      />
                      <div>
                        {/* A div, not a p: <Badge> renders a block. */}
                        <div className="flex flex-wrap items-center gap-2 font-heading text-sm">
                          {COUNSELORS_BY_ID[reaction.counselorId].name}
                          <Badge variant="outline">{reaction.mood}</Badge>
                          <span
                            className={
                              reaction.favorDelta < 0 ? 'text-wax' : 'text-gold'
                            }
                          >
                            {reaction.favorDelta > 0 ? '+' : ''}
                            {reaction.favorDelta} favor
                          </span>
                        </div>
                        <p className="mt-1 text-sm">“{reaction.line}”</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        <Section title="Call log">
          <ol className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
            {log.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ol>
        </Section>
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col">
      <h2 className="mb-3 font-heading text-xl">{title}</h2>
      {children}
    </section>
  )
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
