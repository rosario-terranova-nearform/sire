import { useCallback, useEffect, useRef, useState } from 'react'
import type { Audience, Exchange, Reaction, Vote } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import {
  requestDeliberationTurn as defaultRequestDeliberationTurn,
  requestPetition as defaultRequestPetition,
  requestReactions as defaultRequestReactions,
  requestVotes as defaultRequestVotes,
  type CallOptions,
  type CounselStream,
  type DeliberationTurn,
  type DeliberationTurnOptions,
  type ReactionsResult,
  type VotesResult,
} from '@/ai/calls'
import type { Tally } from '@/ai/sanitize'
import { audienceReducer, resolveSpeakingOrder } from '@/engine/audience-machine'
import { refusesToAttend } from '@/lib/reign'

/**
 * The chamber engine (T-17/T-18) — one continuous run through the two AI
 * stages, driven over the real reducer exactly as `AiScratch` proved by hand.
 *
 * Petitions fire in parallel and stream into their own cards (§5.3); one
 * counselor failing never blocks the others, because each petition ends by
 * closing its own stream in the engine no matter how it went. The floor then
 * runs strictly in speaking order — `speaks-last` last (§5.4) — one live
 * speaker at a time. When the floor closes the council votes (§5.5, T-19) and
 * the chamber holds at the decree: the ruling is the monarch's, and nothing
 * happens until `issueDecree` is called. That advances to the aftermath, where
 * the court reacts and favor is applied to the reign (§5.7, T-20).
 *
 * The AI calls are injectable so the stages can be tested against scripted
 * streams without a network or timers.
 */

export type PetitionStatus =
  | 'waiting'
  | 'speaking'
  | 'complete'
  /** Spoke nothing — the model gave no text (§5.3, T-17). */
  | 'silent'
  /** Refused to attend at all: favor ≤ -8 (§5.7, T-23). The seat sits empty. */
  | 'absent'

export interface PetitionView {
  counselorId: string
  text: string
  status: PetitionStatus
}

export interface ActiveSpeaker {
  counselorId: string
  text: string
  /** 1 first time, 2 once the anti-sycophancy retry has cleared the floor. */
  attempt: number
}

/**
 * The chamber's arc. `tallying` and `reacting` are the two waits the court
 * makes on the clerk; `decree` is the one wait it makes on the monarch.
 */
export type ChamberPhase =
  | 'petition'
  | 'deliberation'
  | 'tallying'
  | 'decree'
  | 'reacting'
  | 'aftermath'

export interface ChamberDeps {
  requestPetition: (
    counselor: CounselorRoster[string],
    audience: Audience,
    reign: Reign,
    options?: CallOptions,
  ) => Promise<CounselStream>
  requestDeliberationTurn: (
    counselor: CounselorRoster[string],
    audience: Audience,
    reign: Reign,
    options?: DeliberationTurnOptions,
  ) => Promise<DeliberationTurn>
  requestVotes: (
    audience: Audience,
    reign: Reign,
    options?: CallOptions,
  ) => Promise<VotesResult>
  requestReactions: (
    audience: Audience,
    reign: Reign,
    options?: CallOptions,
  ) => Promise<ReactionsResult>
}

export interface UseChamberOptions {
  initialAudience: Audience
  reign: Reign
  roster?: CounselorRoster
  /** Kick the run off on mount. Default true. */
  autoStart?: boolean
  /** §5.7 — the finished audience and its reactions, once recorded, so the
   *  caller can commit favor, heard counts and memory to the reign and persist
   *  the audience (T-20/T-23). The audience carries the decree and reactions. */
  onAftermath?: (audience: Audience, reactions: readonly Reaction[]) => void
  /** Test seam: scripted AI calls in place of the real network layer. */
  deps?: Partial<ChamberDeps>
}

export interface ChamberState {
  audience: Audience
  phase: ChamberPhase
  /** In seated order, so the row is stable while cards fill at their own rate. */
  petitions: PetitionView[]
  turns: Exchange[]
  activeSpeaker: ActiveSpeaker | null
  /** §5.5 — the votes and their tally, once the council has spoken. */
  votes: Vote[]
  tally: Tally | null
  /** §5.7 — the court's reactions, once the decree has been ruled. */
  reactions: Reaction[]
  /** §5.6 — the monarch rules. A no-op until the chamber holds at `decree`. */
  issueDecree: (text: string, sidedWithId?: string) => void
}

export function useChamber({
  initialAudience,
  reign,
  roster = COUNSELORS_BY_ID,
  autoStart = true,
  onAftermath,
  deps,
}: UseChamberOptions): ChamberState {
  const requestPetition = deps?.requestPetition ?? defaultRequestPetition
  const requestDeliberationTurn =
    deps?.requestDeliberationTurn ?? defaultRequestDeliberationTurn
  const requestVotes = deps?.requestVotes ?? defaultRequestVotes
  const requestReactions = deps?.requestReactions ?? defaultRequestReactions

  // The live transcript. A ref so each engine step reads the freshest audience
  // synchronously; `audience` state is the render mirror.
  const current = useRef(initialAudience)
  const [audience, setAudience] = useState(initialAudience)
  const [phase, setPhase] = useState<ChamberPhase>('petition')
  const [statuses, setStatuses] = useState<Record<string, PetitionStatus>>(() =>
    initialStatuses(initialAudience.seated),
  )
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null)
  const [tally, setTally] = useState<Tally | null>(null)

  const started = useRef(false)
  // Lives for the whole hook, not just the mount run: the decree fires after
  // the auto-run has returned, and its aftermath fetch must still abort on
  // unmount. Set by the mount effect, read by `issueDecree`.
  const abortRef = useRef<AbortController | null>(null)
  // `onAftermath` is read from a ref so a caller passing a fresh closure each
  // render never restarts the one-shot run (its deps are intentionally empty).
  // Kept current from an effect, never written during render.
  const onAftermathRef = useRef(onAftermath)
  useEffect(() => {
    onAftermathRef.current = onAftermath
  })

  function push(action: Parameters<typeof audienceReducer>[1]) {
    const next = audienceReducer(current.current, action)
    current.current = next
    setAudience(next)
    return next
  }

  function setStatus(counselorId: string, status: PetitionStatus) {
    setStatuses((prev) => ({ ...prev, [counselorId]: status }))
  }

  async function run(signal: AbortSignal) {
    const seated = current.current.seated

    // §5.7 / T-23 — a counselor at favor ≤ -8 refuses to attend; their seat sits
    // empty and they neither petition nor take the floor. The fool is exempt
    // (`licensed-tongue`), so this never silences him. Computed once, up front,
    // so the same council attends every stage of this run.
    const attending = seated.filter((id) => {
      const counselor = roster[id]
      return counselor !== undefined && !refusesToAttend(counselor, reign)
    })
    for (const id of seated) {
      if (!attending.includes(id)) setStatus(id, 'absent')
    }

    // §5.2 → §5.3: seating confirms into petition. Usually already there
    // (the seating screen advanced us); this is the belt-and-braces path.
    if (current.current.stage === 'seating') push({ type: 'advance' })

    setPhase('petition')
    await Promise.all(attending.map((id) => runPetition(id, signal)))
    if (signal.aborted) return

    push({ type: 'advance' }) // petition → deliberation
    setPhase('deliberation')

    for (const id of resolveSpeakingOrder(attending, roster)) {
      if (signal.aborted) return
      await runTurn(id, signal)
    }
    if (signal.aborted) return

    push({ type: 'advance' }) // deliberation → vote
    setPhase('tallying')
    await runVote(signal)
    if (signal.aborted) return

    // §5.6 — the machine holds at the decree. Nothing advances until the
    // monarch rules through `issueDecree`.
    push({ type: 'advance' }) // vote → decree
    setPhase('decree')
  }

  async function runVote(signal: AbortSignal) {
    try {
      const result = await requestVotes(current.current, reign, { signal })
      if (signal.aborted) return
      setTally(result.tally)
      // The AI layer guarantees a complete, self-vote-free tally (T-12); the
      // engine rejects anything less, so a clean payload advances the stage.
      push({ type: 'record-votes', votes: result.votes })
    } catch (error) {
      if (signal.aborted) return
      logChamber('vote failed', 'council', error)
    }
  }

  async function runReactions(signal: AbortSignal) {
    try {
      const result = await requestReactions(current.current, reign, { signal })
      if (signal.aborted) return
      const settled = push({ type: 'record-reactions', reactions: result.reactions })
      onAftermathRef.current?.(settled, result.reactions)
    } catch (error) {
      if (signal.aborted) return
      logChamber('aftermath failed', 'council', error)
    } finally {
      if (!signal.aborted) setPhase('aftermath')
    }
  }

  const issueDecree = useCallback(
    (text: string, sidedWithId?: string) => {
      // Only rule while the chamber is holding for one, and only once.
      if (current.current.stage !== 'decree') return
      // A blank ruling is no ruling — hold rather than record whitespace the
      // engine would technically accept.
      const ruling = text.trim()
      if (ruling.length === 0) return

      const decreed = push({
        type: 'issue-decree',
        decree: { text: ruling, sidedWithId, issuedAt: new Date().toISOString() },
      })
      // A decree the engine refused (empty, over-length, unseated ally) leaves
      // the stage untouched; hold for a valid one rather than stranding the run.
      if (decreed.stage !== 'decree' || decreed.decree === undefined) return

      push({ type: 'advance' }) // decree → aftermath
      setPhase('reacting')

      const signal = abortRef.current?.signal ?? new AbortController().signal
      void runReactions(signal)
    },
    // Stable for the chamber's life; it closes over refs, not render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function runPetition(counselorId: string, signal: AbortSignal) {
    const counselor = roster[counselorId]
    if (counselor === undefined) return

    try {
      const stream = await requestPetition(counselor, current.current, reign, {
        signal,
      })
      setStatus(counselorId, 'speaking')

      for await (const chunk of stream.textStream) {
        if (signal.aborted) return
        push({ type: 'petition-chunk', counselorId, text: chunk })
      }
    } catch (error) {
      if (signal.aborted) return
      // A single petition failing must not sink the room (§5.3, T-17). The seat
      // closes empty and the stage moves on.
      logChamber('petition failed', counselorId, error)
    } finally {
      if (!signal.aborted) {
        push({ type: 'petition-complete', counselorId })
        const spoke = current.current.petitions.some(
          (p) => p.counselorId === counselorId && p.text.trim().length > 0,
        )
        setStatus(counselorId, spoke ? 'complete' : 'silent')
      }
    }
  }

  async function runTurn(counselorId: string, signal: AbortSignal) {
    const counselor = roster[counselorId]
    if (counselor === undefined) return

    setActiveSpeaker({ counselorId, text: '', attempt: 1 })

    try {
      const turn = await requestDeliberationTurn(
        counselor,
        current.current,
        reign,
        {
          signal,
          onChunk: (chunk, { attempt }) =>
            setActiveSpeaker((prev) => ({
              counselorId,
              // A retry (attempt 2) threw out attempt 1's text (§5.4) — start over.
              text: attempt === 1 ? (prev?.text ?? '') + chunk : chunk,
              attempt,
            })),
        },
      )

      if (signal.aborted) return
      push({
        type: 'add-exchange',
        exchange: {
          counselorId: turn.counselorId,
          targetId: turn.targetId,
          text: turn.text,
        },
      })
    } catch (error) {
      if (signal.aborted) return
      logChamber('floor turn failed', counselorId, error)
    } finally {
      setActiveSpeaker((prev) =>
        prev?.counselorId === counselorId ? null : prev,
      )
    }
  }

  useEffect(() => {
    if (!autoStart) return

    const controller = new AbortController()
    abortRef.current = controller
    let active = true

    // Deferred a tick so React 19 StrictMode's mount→unmount→mount in dev does
    // not fire the pipeline twice: the first schedule is cleared on the throwaway
    // cleanup before it can run.
    const timer = setTimeout(() => {
      if (!active || started.current) return
      started.current = true
      void run(controller.signal)
    }, 0)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
    // The run is a one-shot over the audience this hook was created with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    audience,
    phase,
    petitions: audience.seated.map((counselorId) => ({
      counselorId,
      text:
        audience.petitions.find((p) => p.counselorId === counselorId)?.text ??
        '',
      status: statuses[counselorId] ?? 'waiting',
    })),
    turns: audience.deliberation,
    activeSpeaker,
    votes: audience.votes,
    tally,
    reactions: audience.reactions,
    issueDecree,
  }
}

function initialStatuses(seated: readonly string[]): Record<string, PetitionStatus> {
  return Object.fromEntries(seated.map((id) => [id, 'waiting' as const]))
}

function logChamber(what: string, counselorId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  // Not red: the AI layer has already handled and counted the model failure
  // (§7.1). This is a breadcrumb for the local developer, nothing more.
  console.info(`[chamber] ${what} · ${counselorId} · ${message}`)
}
