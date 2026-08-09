import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider'
import type { Audience } from '@/domain/audience'
import type { Reign } from '@/domain/reign'
import type { ModelResolver } from '@/ai/client'

/**
 * Fixtures for the AI layer. Every model here is a `MockLanguageModelV4`, so
 * the tests exercise the *real* `streamText` / `generateObject` code paths —
 * only the network is faked.
 */

export const SEATED = ['vane', 'marrow', 'hob']

export function makeReign(overrides: Partial<Reign> = {}): Reign {
  return {
    id: 'reign-1',
    monarchName: 'Rosario the Unbothered',
    favor: {},
    heardCount: {},
    revealedAgendas: [],
    history: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

export function makeAudience(overrides: Partial<Audience> = {}): Audience {
  return {
    id: 'aud-1',
    question: 'Should the western granaries be opened before the thaw?',
    seated: [...SEATED],
    stage: 'petition',
    petitions: [],
    deliberation: [],
    votes: [],
    reactions: [],
    createdAt: '2026-08-06T09:00:00.000Z',
    ...overrides,
  }
}

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
}

const STOPPED: LanguageModelV4FinishReason = { unified: 'stop', raw: 'stop' }

const FINISH: LanguageModelV4StreamPart = {
  type: 'finish',
  finishReason: STOPPED,
  usage: USAGE,
}

function textParts(chunks: readonly string[]): LanguageModelV4StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: '0' },
    ...chunks.map((delta): LanguageModelV4StreamPart => ({
      type: 'text-delta',
      id: '0',
      delta,
    })),
    { type: 'text-end', id: '0' },
    FINISH,
  ]
}

function readable(
  parts: readonly LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
}

/** A model that streams `chunks` (defaults to one chunk of `text`). */
export function mockTextModel(
  modelId: string,
  text: string,
  chunks?: readonly string[],
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId,
    doStream: async () => ({
      stream: readable(textParts(chunks ?? [text])),
    }),
  })
}

/**
 * A model that says something different each call — one fresh stream per call,
 * because a `ReadableStream` can only be read once.
 */
export function mockSequenceModel(
  modelId: string,
  texts: readonly string[],
): MockLanguageModelV4 {
  let call = 0

  return new MockLanguageModelV4({
    modelId,
    doStream: async () => {
      const text = texts[Math.min(call, texts.length - 1)]
      call += 1
      return { stream: readable(textParts([text])) }
    },
  })
}

/** A model that closes its stream without saying a word. */
export function mockSilentModel(modelId: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId,
    doStream: async () => ({
      stream: readable([{ type: 'stream-start', warnings: [] }, FINISH]),
    }),
  })
}

/** A model that refuses the call outright. */
export function mockDeadModel(
  modelId: string,
  message = 'model is gone',
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId,
    doStream: async () => {
      throw new Error(message)
    },
    doGenerate: async () => {
      throw new Error(message)
    },
  })
}

/**
 * A model that dies *after* it has already started speaking. The failure is
 * delivered on a later pull, not in `start`, so the SDK cannot quietly retry
 * the call — which is exactly the case the app has to survive.
 */
export function mockTruncatedModel(
  modelId: string,
  opening: string,
  message = 'connection lost',
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    modelId,
    doStream: async () => {
      const opener: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: opening },
      ]
      let sent = 0

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          pull(controller) {
            if (sent < opener.length) {
              controller.enqueue(opener[sent])
              sent += 1
              return
            }
            controller.error(new Error(message))
          },
        }),
      }
    },
  })
}

/**
 * A model that 429s the way OpenRouter does when the key's whole free-model
 * quota is spent for the day. Every free model on that key answers this way.
 */
export function mockQuotaExhaustedModel(modelId: string): MockLanguageModelV4 {
  const refuse = () => {
    throw new APICallError({
      message: 'Rate limit exceeded: free-models-per-day',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          message:
            'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
          code: 429,
        },
      }),
      responseHeaders: { 'x-ratelimit-reset': '1786147200000' },
    })
  }

  return new MockLanguageModelV4({
    modelId,
    doStream: async () => refuse(),
    doGenerate: async () => refuse(),
  })
}

/** A model that 429s once on its own account, then answers. */
export function mockRateLimitedOnceModel(
  modelId: string,
  text: string,
): MockLanguageModelV4 {
  let calls = 0

  return new MockLanguageModelV4({
    modelId,
    doStream: async () => {
      calls += 1
      if (calls === 1) {
        throw new APICallError({
          message: `${modelId} is temporarily rate-limited upstream`,
          url: 'https://openrouter.ai/api/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 429,
          responseBody: JSON.stringify({
            error: {
              message: `${modelId} is temporarily rate-limited upstream`,
            },
          }),
        })
      }
      return { stream: readable(textParts([text])) }
    },
  })
}

/** A model that returns one JSON object per call, in order. */
export function mockObjectModel(
  modelId: string,
  objects: readonly unknown[],
): MockLanguageModelV4 {
  let call = 0

  return new MockLanguageModelV4({
    modelId,
    doGenerate: async (): Promise<LanguageModelV4GenerateResult> => {
      const object = objects[Math.min(call, objects.length - 1)]
      call += 1

      return {
        content: [{ type: 'text', text: JSON.stringify(object) }],
        finishReason: STOPPED,
        usage: USAGE,
        warnings: [],
      }
    },
  })
}

/**
 * A resolver over a slug → model map. Any slug not in the map is treated as a
 * dead model, which is how "kill the first entry in the chain" is simulated.
 */
export function resolverFor(
  models: Readonly<Record<string, MockLanguageModelV4>>,
): ModelResolver {
  return (modelId) => models[modelId] ?? mockDeadModel(modelId, 'not mapped')
}
