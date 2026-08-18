import { generateObject, streamText, type ModelMessage } from 'ai'
import type { Audience, Reaction, Vote } from '@/domain/audience'
import type { Counselor, CounselorRoster, Faction } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import type { CrisisCategory } from '@/content/crisis-patterns'
import { screenQuestion } from '@/lib/crisis'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import {
  demoExchange,
  demoPetition,
  demoReactions,
  demoVote,
  demoVotes,
} from '@/content/demo-audience'
import { countMetric } from '@/lib/metrics'
import {
  MissingApiKeyError,
  hasApiKey,
  resolveLanguageModel,
  type ModelResolver,
} from './client'
import { engageDemoMode, isKeyWideDemoMode, type DemoReason } from './demo-mode'
import { FreeTierExhaustedError } from './rate-limit'
import { throttled } from './throttle'
import {
  AllModelsFailedError,
  COUNCIL_MODELS,
  FREE_LAST_RESORT,
  resolveFromChain,
  resolveModel,
  type FallbackInfo,
} from './models'
import {
  buildAftermathMessages,
  buildDeliberationMessages,
  buildPetitionMessages,
  buildVoteMessages,
  type DeliberationRetry,
} from './prompt-builder'
import { reactionsSchema, votesSchema } from './schemas'
import {
  mergeSanitizedReactions,
  mergeSanitizedVotes,
  reactionRepairInstruction,
  sanitizeReactions,
  sanitizeVotes,
  sortBySeating,
  tallyVotes,
  voteRepairInstruction,
  type SanitizedReactions,
  type SanitizedVotes,
  type Tally,
} from './sanitize'
import {
  validateExchange,
  violationReasons,
  type ExchangeViolation,
} from './validate-exchange'

/**
 * Every model call in the app (§7). The browser talks to OpenRouter directly —
 * there is no backend, no proxy, no route handler.
 *
 * Three invariants hold across all four calls:
 *  1. A counselor who is not at this table never reaches a prompt — that throws
 *     before any network call.
 *  2. A failing model falls through its chain (§6.3) without the caller
 *     noticing.
 *  3. When the chain is exhausted, the call returns the recording (§7.1). It
 *     does not throw. The one exception is an aborted signal, which is the
 *     caller's own doing and is rethrown.
 */

/** §5.3/§5.4 — the hard ceiling behind "2 to 4 sentences". */
export const PETITION_MAX_TOKENS = 220
export const DELIBERATION_MAX_TOKENS = 260
/** §5.5/§5.7 — a whole tally or a whole chamber's reaction in one object. */
export const STRUCTURED_MAX_TOKENS = 1500

/** Counsel wants voice; the clerk wants obedience. */
export const COUNSEL_TEMPERATURE = 0.9
export const CLERK_TEMPERATURE = 0.4

/**
 * No thinking out loud, on any call.
 *
 * Several free-tier models are reasoning models, and when they stream, their
 * scratchpad arrives as content — during T-08 verification the Mistress of
 * Whispers opened with "We need to output as Wren: quiet, implied…" and then
 * ran out of budget before saying anything to the monarch. Reasoning also
 * spends the 2-to-4-sentence ceiling on prose nobody will ever read.
 *
 * `openrouter/free` refuses a hard disable ("Reasoning is mandatory for this
 * endpoint", HTTP 400), which would take the last free tier out of every chain.
 * There the scratchpad is merely excluded from the response instead.
 */
function reasoningOptions(modelId: string) {
  return modelId === FREE_LAST_RESORT
    ? { openrouter: { reasoning: { exclude: true } } }
    : { openrouter: { reasoning: { enabled: false } } }
}

/** Cadence for canned text, so demo mode still reads as a scene rather than
 *  appearing all at once. */
export const DEMO_CHUNK_DELAY_MS = 60
/** Ticks a recording may take, however long the text is. */
export const DEMO_MAX_CHUNKS = 12

/** The `modelId` reported by anything served from the recording. */
export const DEMO_MODEL_ID = 'demo:recording'

export type CounselSource = 'live' | 'demo'

export class UnknownCounselorError extends Error {
  readonly kind = 'unknown-counselor'
  readonly counselorId: string

  constructor(counselorId: string) {
    super(`No counselor with id "${counselorId}" exists in the roster.`)
    this.name = 'UnknownCounselorError'
    this.counselorId = counselorId
  }
}

export class NotSeatedError extends Error {
  readonly kind = 'not-seated'
  readonly counselorId: string

  constructor(counselorId: string) {
    super(`Counselor "${counselorId}" is not seated at this audience.`)
    this.name = 'NotSeatedError'
    this.counselorId = counselorId
  }
}

/**
 * §9 / T-22 — the crisis screen is not only the composer's gate; it is baked
 * into the generation boundary itself. Every one of the four calls screens the
 * question before it does any work, so no future call site — a resumed audience,
 * a scripted harness, a refactor — can reach a model with a flagged question.
 * This is a UX safeguard, not a network boundary (the app is local and
 * single-user), which is exactly why it lives at the point generation begins
 * rather than behind a server that does not exist.
 */
export class CrisisAdjournedError extends Error {
  readonly kind = 'crisis-adjourned'
  readonly category: CrisisCategory

  constructor(category: CrisisCategory) {
    super('The court is adjourned: this question was flagged by the crisis screen.')
    this.name = 'CrisisAdjournedError'
    this.category = category
  }
}

export class EmptyCompletionError extends Error {
  readonly kind = 'empty-completion'
  readonly modelId: string

  constructor(modelId: string) {
    super(`${modelId} returned no text.`)
    this.name = 'EmptyCompletionError'
    this.modelId = modelId
  }
}

export interface CallOptions {
  signal?: AbortSignal
  /** Defaults to the seeded council; custom counselors (T-21) pass their own. */
  roster?: CounselorRoster
  /** Seam for tests: a slug in, a model out, no network. */
  resolveLanguageModel?: ModelResolver
  onFallback?: (info: FallbackInfo) => void
  /** Mid-stream failure, after the counselor had already begun speaking. */
  onStreamError?: (error: unknown) => void
  demoChunkDelayMs?: number
}

export interface CounselStream {
  counselorId: string
  /** The slug that answered, or `demo:recording`. */
  modelId: string
  source: CounselSource
  textStream: AsyncIterable<string>
}

/* --------------------------------------------------------------- petitions */

/**
 * §5.3 — one independent petition. Fired once per seated counselor, in
 * parallel; no counselor's messages contain another's text.
 */
export async function requestPetition(
  counselor: Counselor,
  audience: Audience,
  reign: Reign,
  options: CallOptions = {},
): Promise<CounselStream> {
  assertNotCrisis(audience)
  const roster = options.roster ?? COUNSELORS_BY_ID
  assertAtTable(counselor, audience, roster)

  return openCounselStream({
    counselorId: counselor.id,
    faction: counselor.faction,
    messages: buildPetitionMessages(counselor, audience, reign),
    maxOutputTokens: PETITION_MAX_TOKENS,
    demoText: () => demoPetition(counselor.id),
    options,
  })
}

/* ------------------------------------------------------------ deliberation */

export interface DeliberationTurnOptions extends CallOptions {
  /**
   * Chunks as they arrive. `attempt` is 1 or 2 — on 2 the UI should clear what
   * it showed for attempt 1, because that turn was thrown out (§5.4).
   */
  onChunk?: (chunk: string, context: { attempt: number }) => void
}

export interface DeliberationTurn {
  counselorId: string
  /** Never null: the engine will not accept an exchange without a target. */
  targetId: string
  text: string
  modelId: string
  source: CounselSource
  /** 1 when accepted first time, 2 when it took the stricter reminder. */
  attempts: number
  /** Non-empty only when a turn was kept despite failing twice (§5.4). */
  violations: ExchangeViolation[]
}

/**
 * §5.4 — one adversarial turn, validated against the anti-sycophancy contract.
 * A failing turn gets exactly one stricter retry; a second failure is kept but
 * counted as `sycophancy_violation` (T-11).
 *
 * Buffered rather than handed back as a stream: a turn cannot be validated
 * until it has finished, and an invalid turn must not survive in the
 * transcript. `onChunk` is there so the UI can still stream it live.
 */
export async function requestDeliberationTurn(
  counselor: Counselor,
  audience: Audience,
  reign: Reign,
  options: DeliberationTurnOptions = {},
): Promise<DeliberationTurn> {
  assertNotCrisis(audience)
  const roster = options.roster ?? COUNSELORS_BY_ID
  assertAtTable(counselor, audience, roster)

  const context = { seated: audience.seated, roster }
  const canned = demoExchange(counselor.id, audience.seated)
  const fallbackTargetId =
    canned?.targetId ??
    audience.seated.find((id) => id !== counselor.id) ??
    counselor.id

  const speak = async (attempt: number, retry?: DeliberationRetry) => {
    const stream = await openCounselStream({
      counselorId: counselor.id,
      faction: counselor.faction,
      messages: buildDeliberationMessages(counselor, audience, reign, roster, {
        retry,
      }),
      maxOutputTokens: DELIBERATION_MAX_TOKENS,
      demoText: () => canned?.text ?? demoPetition(counselor.id),
      options,
    })

    let text = ''
    for await (const chunk of stream.textStream) {
      text += chunk
      options.onChunk?.(chunk, { attempt })
    }

    return { stream, text: text.trim() }
  }

  const first = await speak(1)
  const turn = (
    spoken: Awaited<ReturnType<typeof speak>>,
    attempts: number,
    targetId: string,
    violations: ExchangeViolation[],
  ): DeliberationTurn => ({
    counselorId: counselor.id,
    targetId,
    text: spoken.text,
    modelId: spoken.stream.modelId,
    source: spoken.stream.source,
    attempts,
    violations,
  })

  // The recording is written to the contract already — retrying it would only
  // replay the same words.
  if (first.stream.source === 'demo') {
    return turn(first, 1, fallbackTargetId, [])
  }

  const firstCheck = validateExchange(
    { counselorId: counselor.id, text: first.text },
    context,
  )
  if (firstCheck.ok && firstCheck.targetId !== null) {
    return turn(first, 1, firstCheck.targetId, [])
  }

  const second = await speak(2, {
    rejectedText: first.text,
    reasons: violationReasons(firstCheck),
  })
  if (second.stream.source === 'demo') {
    return turn(second, 2, fallbackTargetId, [])
  }

  const secondCheck = validateExchange(
    { counselorId: counselor.id, text: second.text },
    context,
  )
  if (!secondCheck.ok) {
    // §5.4: keep the output, count the violation.
    countMetric('sycophancy_violation', {
      counselorId: counselor.id,
      violations: secondCheck.violations.join(','),
    })
  }

  return turn(
    second,
    2,
    secondCheck.targetId ?? fallbackTargetId,
    secondCheck.violations,
  )
}

/* -------------------------------------------------------------------- vote */

export interface VotesResult {
  votes: Vote[]
  tally: Tally
  modelId: string
  source: CounselSource
  /** True when the one-shot repair retry was needed (§6.4). */
  repaired: boolean
  problems: SanitizedVotes['problems']
  /** Seats the model never filled, filled from the recording so the tally is
   *  complete — the engine rejects a partial tally. */
  filled: string[]
}

/** §5.5 — the whole tally in one `generateObject` call. Ties stay tied. */
export async function requestVotes(
  audience: Audience,
  reign: Reign,
  options: CallOptions = {},
): Promise<VotesResult> {
  assertNotCrisis(audience)
  const roster = options.roster ?? COUNSELORS_BY_ID
  const seated = seatedIds(audience, roster)

  const asDemo = (): VotesResult => {
    const votes = demoVotes(seated)
    return {
      votes,
      tally: tallyVotes(votes, seated),
      modelId: DEMO_MODEL_ID,
      source: 'demo',
      repaired: false,
      problems: [],
      filled: [],
    }
  }

  if (shouldRecord(options)) {
    engageRecording()
    return asDemo()
  }

  const messages = buildVoteMessages(audience, reign, roster)

  try {
    const attempt = await resolveFromChain(
      COUNCIL_MODELS,
      async (modelId) => {
        const first = await throttled(() =>
          generateObject({
            model: modelFor(modelId, options),
            messages,
            allowSystemInMessages: true,
            schema: votesSchema,
            maxOutputTokens: STRUCTURED_MAX_TOKENS,
            temperature: CLERK_TEMPERATURE,
            providerOptions: reasoningOptions(modelId),
            maxRetries: 0,
            abortSignal: options.signal,
          }),
        )

        let sanitized = sanitizeVotes(first.object.votes, seated)
        let repaired = false

        if (needsRepair(sanitized)) {
          countMetric('structured_repair', { call: 'votes', modelId })
          repaired = true

          const repair = await throttled(() =>
            generateObject({
              model: modelFor(modelId, options),
              messages: withRepair(
                messages,
                first.object,
                voteRepairInstruction(sanitized),
              ),
              allowSystemInMessages: true,
              schema: votesSchema,
              maxOutputTokens: STRUCTURED_MAX_TOKENS,
              temperature: CLERK_TEMPERATURE,
              providerOptions: reasoningOptions(modelId),
              maxRetries: 0,
              abortSignal: options.signal,
            }),
          )

          sanitized = mergeSanitizedVotes(
            sanitized,
            sanitizeVotes(repair.object.votes, seated),
            seated,
          )
        }

        return { sanitized, repaired }
      },
      { signal: options.signal, onFallback: options.onFallback },
    )

    const { sanitized, repaired } = attempt.value
    reportDropped('votes', sanitized.problems.length)

    const votes = [...sanitized.votes]
    const filled: string[] = []
    for (const voterId of sanitized.missing) {
      const stand = demoVote(voterId, seated)
      if (stand === null) continue
      votes.push(stand)
      filled.push(voterId)
      countMetric('structured_entry_filled', { call: 'votes', voterId })
    }

    return {
      votes: sortBySeating(votes, seated, (vote) => vote.voterId),
      tally: tallyVotes(votes, seated),
      modelId: attempt.modelId,
      source: 'live',
      repaired,
      problems: sanitized.problems,
      filled,
    }
  } catch (error) {
    if (!isExhausted(error, options)) throw error
    engageDemoMode(recordingReason(error))
    return asDemo()
  }
}

/* --------------------------------------------------------------- aftermath */

export interface ReactionsResult {
  reactions: Reaction[]
  modelId: string
  source: CounselSource
  repaired: boolean
  problems: SanitizedReactions['problems']
  /** Seats that reacted with silence because the model skipped them. */
  filled: string[]
}

/** §5.7 — mood, one line, and a favor delta per counselor, in one call. */
export async function requestReactions(
  audience: Audience,
  reign: Reign,
  options: CallOptions = {},
): Promise<ReactionsResult> {
  assertNotCrisis(audience)
  const roster = options.roster ?? COUNSELORS_BY_ID
  const seated = seatedIds(audience, roster)

  const asDemo = (): ReactionsResult => ({
    reactions: demoReactions(seated),
    modelId: DEMO_MODEL_ID,
    source: 'demo',
    repaired: false,
    problems: [],
    filled: [],
  })

  if (shouldRecord(options)) {
    engageRecording()
    return asDemo()
  }

  const messages = buildAftermathMessages(audience, reign, roster)

  try {
    const attempt = await resolveFromChain(
      COUNCIL_MODELS,
      async (modelId) => {
        const first = await throttled(() =>
          generateObject({
            model: modelFor(modelId, options),
            messages,
            allowSystemInMessages: true,
            schema: reactionsSchema,
            maxOutputTokens: STRUCTURED_MAX_TOKENS,
            temperature: CLERK_TEMPERATURE,
            providerOptions: reasoningOptions(modelId),
            maxRetries: 0,
            abortSignal: options.signal,
          }),
        )

        let sanitized = sanitizeReactions(first.object.reactions, seated)
        let repaired = false

        if (needsRepair(sanitized)) {
          countMetric('structured_repair', { call: 'reactions', modelId })
          repaired = true

          const repair = await throttled(() =>
            generateObject({
              model: modelFor(modelId, options),
              messages: withRepair(
                messages,
                first.object,
                reactionRepairInstruction(sanitized),
              ),
              allowSystemInMessages: true,
              schema: reactionsSchema,
              maxOutputTokens: STRUCTURED_MAX_TOKENS,
              temperature: CLERK_TEMPERATURE,
              providerOptions: reasoningOptions(modelId),
              maxRetries: 0,
              abortSignal: options.signal,
            }),
          )

          sanitized = mergeSanitizedReactions(
            sanitized,
            sanitizeReactions(repair.object.reactions, seated),
            seated,
          )
        }

        return { sanitized, repaired }
      },
      { signal: options.signal, onFallback: options.onFallback },
    )

    const { sanitized, repaired } = attempt.value
    reportDropped('reactions', sanitized.problems.length)

    const reactions = [...sanitized.reactions]
    const filled: string[] = []
    for (const counselorId of sanitized.missing) {
      reactions.push(silentReaction(counselorId))
      filled.push(counselorId)
      countMetric('structured_entry_filled', { call: 'reactions', counselorId })
    }

    return {
      reactions: sortBySeating(reactions, seated, (r) => r.counselorId),
      modelId: attempt.modelId,
      source: 'live',
      repaired,
      problems: sanitized.problems,
      filled,
    }
  } catch (error) {
    if (!isExhausted(error, options)) throw error
    engageDemoMode(recordingReason(error))
    return asDemo()
  }
}

/** A seat that said nothing. Favor cannot move on silence. */
export function silentReaction(counselorId: string): Reaction {
  return {
    counselorId,
    mood: 'neutral',
    line: '(says nothing, sire)',
    favorDelta: 0,
  }
}

/* --------------------------------------------------------------- internals */

interface OpenStreamInput {
  counselorId: string
  faction: Faction
  messages: ModelMessage[]
  maxOutputTokens: number
  demoText: () => string
  options: CallOptions
}

async function openCounselStream({
  counselorId,
  faction,
  messages,
  maxOutputTokens,
  demoText,
  options,
}: OpenStreamInput): Promise<CounselStream> {
  if (shouldRecord(options)) {
    engageRecording()
    return recordedStream(counselorId, demoText(), options)
  }

  try {
    const attempt = await resolveModel(
      faction,
      (modelId) =>
        probeStream({
          modelId,
          messages,
          maxOutputTokens,
          options,
        }),
      { signal: options.signal, onFallback: options.onFallback },
    )

    return {
      counselorId,
      modelId: attempt.modelId,
      source: 'live',
      textStream: attempt.value,
    }
  } catch (error) {
    if (!isExhausted(error, options)) throw error
    engageDemoMode(recordingReason(error))
    return recordedStream(counselorId, demoText(), options)
  }
}

interface ProbeInput {
  modelId: string
  messages: ModelMessage[]
  maxOutputTokens: number
  options: CallOptions
}

/**
 * Open a stream and pull until the first real text arrives, so a model that
 * fails — or that spends its whole budget thinking and says nothing — is
 * discovered *before* the chain has committed to it.
 */
async function probeStream({
  modelId,
  messages,
  maxOutputTokens,
  options,
}: ProbeInput): Promise<AsyncIterable<string>> {
  let streamError: unknown

  /**
   * The request is created *inside* the pacer, not before it, for two reasons:
   * a slot should cover the call it paces, and by the time a queued slot opens
   * an earlier call may already have found the key spent — in which case this
   * one must not dial out at all. Without that re-check, five parallel
   * petitions each discover the same exhausted quota separately.
   */
  const { iterator, opening, closed } = await throttled(async () => {
    if (isKeyWideDemoMode()) {
      throw new FreeTierExhaustedError(
        'The free-model quota for this key is spent.',
      )
    }

    const result = streamText({
      model: modelFor(modelId, options),
      messages,
      // §6 keeps the whole prompt in one `ModelMessage[]`, system message and
      // all; the AI SDK needs telling that this is deliberate.
      allowSystemInMessages: true,
      maxOutputTokens,
      temperature: COUNSEL_TEMPERATURE,
      providerOptions: reasoningOptions(modelId),
      // We own the retry policy: the chain (§6.3) plus one patient retry on a
      // 429. Letting the SDK retry on top of that triples every request.
      maxRetries: 0,
      abortSignal: options.signal,
      // streamText reports failures here rather than throwing at the call site.
      onError: ({ error }) => {
        streamError = error
      },
    })

    // Only the *opening* of the stream holds a slot: the rest of the tokens are
    // one connection already granted, and waiting on them here would serialise
    // the whole chamber.
    const streamIterator = result.textStream[Symbol.asyncIterator]()
    const firstChunks: string[] = []
    let ended = false

    for (;;) {
      const next = await streamIterator.next()
      if (next.done === true) {
        ended = true
        break
      }
      firstChunks.push(next.value)
      if (next.value.trim().length > 0) break
    }

    return { iterator: streamIterator, opening: firstChunks, closed: ended }
  })

  if (closed && opening.join('').trim().length === 0) {
    throw streamError ?? new EmptyCompletionError(modelId)
  }

  async function* drain(): AsyncGenerator<string> {
    yield* opening

    if (!closed) {
      try {
        for (;;) {
          const next = await iterator.next()
          if (next.done === true) break
          yield next.value
        }
      } catch (error) {
        streamError = error
      }
    }

    if (streamError !== undefined) {
      // The counselor was cut off mid-sentence. T-25 dresses this in-world;
      // here it is a metric and a partial turn, never a thrown stage.
      countMetric('stream_error', { modelId })
      options.onStreamError?.(streamError)
    }
  }

  return drain()
}

/**
 * Break canned text into at most `DEMO_MAX_CHUNKS` pieces, on word boundaries.
 *
 * A word at a time reads best but costs one timer per word, and a browser that
 * throttles timers (a background tab clamps them to about a second) turns a
 * four-sentence petition into a minute of watching. Bounding the tick count
 * keeps the cadence and keeps the recording finite.
 */
export function chunkRecording(text: string, maxChunks = DEMO_MAX_CHUNKS) {
  const words = text.match(/\S+\s*/gu) ?? []
  if (words.length <= maxChunks) return words

  const perChunk = Math.ceil(words.length / maxChunks)
  const chunks: string[] = []
  for (let index = 0; index < words.length; index += perChunk) {
    chunks.push(words.slice(index, index + perChunk).join(''))
  }
  return chunks
}

function recordedStream(
  counselorId: string,
  text: string,
  options: CallOptions,
): CounselStream {
  const delayMs = options.demoChunkDelayMs ?? DEMO_CHUNK_DELAY_MS

  async function* speak(): AsyncGenerator<string> {
    for (const chunk of chunkRecording(text)) {
      if (delayMs > 0) await sleep(delayMs)
      yield chunk
    }
  }

  return {
    counselorId,
    modelId: DEMO_MODEL_ID,
    source: 'demo',
    textStream: speak(),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Engage demo mode for a call that never dialled out. When the key is already
 * known to be spent, that reason is the true one and must not be overwritten
 * with "no key configured" — the banner would then say something false.
 */
function engageRecording(): void {
  if (isKeyWideDemoMode()) return
  engageDemoMode('missing-api-key')
}

/**
 * Whether to skip the network entirely.
 *
 * Two ways: there is nothing to call (no key, and no resolver injected by a
 * test), or the key itself is already known to be spent — in which case no
 * model and no resolver can rescue this session, and dialling out eleven more
 * times per audience only produces eleven more 429s in the console.
 */
function shouldRecord(options: CallOptions): boolean {
  if (isKeyWideDemoMode()) return true
  return options.resolveLanguageModel === undefined && !hasApiKey()
}

function modelFor(modelId: string, options: CallOptions) {
  return (options.resolveLanguageModel ?? resolveLanguageModel)(modelId)
}

/** Distinguishes "the models are gone" from "the caller cancelled". */
function isExhausted(error: unknown, options: CallOptions): boolean {
  if (options.signal?.aborted === true) return false
  return (
    error instanceof AllModelsFailedError ||
    error instanceof MissingApiKeyError ||
    error instanceof FreeTierExhaustedError
  )
}

/** Why the court went to tape, so the banner can say the true thing (§7.1). */
function recordingReason(error: unknown): DemoReason {
  return error instanceof FreeTierExhaustedError
    ? 'free-quota-spent'
    : 'all-models-failed'
}

/**
 * §9 / T-22 — refuse to generate anything for a flagged question. Runs before
 * the network, before demo mode, before anything: a crisis question produces no
 * counsel of any kind, live or recorded.
 */
function assertNotCrisis(audience: Audience): void {
  const screen = screenQuestion(audience.question)
  if (screen.adjourn) throw new CrisisAdjournedError(screen.category)
}

function assertAtTable(
  counselor: Counselor,
  audience: Audience,
  roster: CounselorRoster,
): void {
  if (roster[counselor.id] === undefined) {
    throw new UnknownCounselorError(counselor.id)
  }
  if (!audience.seated.includes(counselor.id)) {
    throw new NotSeatedError(counselor.id)
  }
}

function seatedIds(audience: Audience, roster: CounselorRoster): string[] {
  return audience.seated.filter((id) => roster[id] !== undefined)
}

function needsRepair(
  sanitized: Pick<SanitizedVotes | SanitizedReactions, 'problems' | 'missing'>,
): boolean {
  return sanitized.problems.length > 0 || sanitized.missing.length > 0
}

function reportDropped(call: 'votes' | 'reactions', dropped: number): void {
  for (let index = 0; index < dropped; index += 1) {
    countMetric('structured_entry_dropped', { call })
  }
}

/** The model's own bad answer, then the complaint. One retry, never a loop. */
function withRepair(
  messages: ModelMessage[],
  rejected: unknown,
  instruction: string,
): ModelMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: JSON.stringify(rejected) },
    { role: 'user', content: instruction },
  ]
}
