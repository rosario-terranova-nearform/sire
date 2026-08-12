import { useEffect, useRef, useState } from 'react'
import type { Audience, Exchange } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import {
  requestDeliberationTurn as defaultRequestDeliberationTurn,
  requestPetition as defaultRequestPetition,
  type CallOptions,
  type CounselStream,
  type DeliberationTurn,
  type DeliberationTurnOptions,
} from '@/ai/calls'
import { audienceReducer, resolveSpeakingOrder } from '@/engine/audience-machine'

/**
 * The chamber engine (T-17/T-18) — one continuous run through the two AI
 * stages, driven over the real reducer exactly as `AiScratch` proved by hand.
 *
 * Petitions fire in parallel and stream into their own cards (§5.3); one
 * counselor failing never blocks the others, because each petition ends by
 * closing its own stream in the engine no matter how it went. The floor then
 * runs strictly in speaking order — `speaks-last` last (§5.4) — one live
 * speaker at a time. When the floor closes the machine advances to `vote` and
 * the chamber holds there: the tally and decree are T-19.
 *
 * The AI calls are injectable so the stages can be tested against scripted
 * streams without a network or timers.
 */

export type PetitionStatus = 'waiting' | 'speaking' | 'complete' | 'silent'

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

export type ChamberPhase = 'petition' | 'deliberation' | 'concluded'

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
}

export interface UseChamberOptions {
  initialAudience: Audience
  reign: Reign
  roster?: CounselorRoster
  /** Kick the run off on mount. Default true. */
  autoStart?: boolean
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
}

export function useChamber({
  initialAudience,
  reign,
  roster = COUNSELORS_BY_ID,
  autoStart = true,
  deps,
}: UseChamberOptions): ChamberState {
  const requestPetition = deps?.requestPetition ?? defaultRequestPetition
  const requestDeliberationTurn =
    deps?.requestDeliberationTurn ?? defaultRequestDeliberationTurn

  // The live transcript. A ref so each engine step reads the freshest audience
  // synchronously; `audience` state is the render mirror.
  const current = useRef(initialAudience)
  const [audience, setAudience] = useState(initialAudience)
  const [phase, setPhase] = useState<ChamberPhase>('petition')
  const [statuses, setStatuses] = useState<Record<string, PetitionStatus>>(() =>
    initialStatuses(initialAudience.seated),
  )
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null)

  const started = useRef(false)

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

    // §5.2 → §5.3: seating confirms into petition. Usually already there
    // (the seating screen advanced us); this is the belt-and-braces path.
    if (current.current.stage === 'seating') push({ type: 'advance' })

    setPhase('petition')
    await Promise.all(seated.map((id) => runPetition(id, signal)))
    if (signal.aborted) return

    push({ type: 'advance' }) // petition → deliberation
    setPhase('deliberation')

    for (const id of resolveSpeakingOrder(seated, roster)) {
      if (signal.aborted) return
      await runTurn(id, signal)
    }
    if (signal.aborted) return

    push({ type: 'advance' }) // deliberation → vote
    setPhase('concluded')
  }

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
