import { z } from 'zod'

/**
 * Structured-output schemas (§6.4), handed straight to `generateObject`.
 *
 * These are deliberately looser than `src/domain/schemas.ts`: they describe
 * what a model is *allowed to say*, not what the domain accepts. The business
 * rules a schema cannot express — no self-votes, every seated counselor
 * present, ids within `seated` — are enforced afterwards in `sanitize.ts`.
 */

export const votesSchema = z.object({
  votes: z.array(
    z.object({
      voterId: z.string(),
      forId: z.string(),
      rationale: z.string().max(120),
    }),
  ),
})

export const reactionsSchema = z.object({
  reactions: z.array(
    z.object({
      counselorId: z.string(),
      mood: z.enum(['neutral', 'pleased', 'appalled', 'scheming']),
      line: z.string().max(100),
      favorDelta: z.number().int().min(-2).max(2),
    }),
  ),
})

export type RawVotes = z.infer<typeof votesSchema>
export type RawReactions = z.infer<typeof reactionsSchema>
export type RawVote = RawVotes['votes'][number]
export type RawReaction = RawReactions['reactions'][number]
