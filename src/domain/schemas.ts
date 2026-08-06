import { z } from 'zod'
import type {
  Ability,
  AbilityEffect,
  Counselor,
  Faction,
  SpriteState,
  StatKey,
  Stats,
  Voice,
} from './counselor'
import type {
  Audience,
  Decree,
  Exchange,
  Petition,
  Reaction,
  Stage,
  Vote,
} from './audience'
import { MAX_DECREE_LENGTH, MAX_QUESTION_LENGTH } from './audience'
import type { Reign } from './reign'
import { MAX_FAVOR, MIN_FAVOR } from './reign'

/**
 * Runtime mirrors of the §3 domain types, used to validate anything crossing
 * an API boundary — model output, `localStorage`, imported fixtures.
 *
 * Every schema is annotated `z.ZodType<T>`, so a schema drifting from its
 * type is a compile error rather than a runtime surprise.
 */

const idSchema = z.string().min(1)
const isoDateSchema = z.iso.datetime()

export const factionSchema: z.ZodType<Faction> = z.enum([
  'martial',
  'coin',
  'fool',
  'temple',
  'whispers',
  'commons',
])

export const statKeySchema: z.ZodType<StatKey> = z.enum([
  'candor',
  'prudence',
  'guile',
])

const pipSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

export const statsSchema: z.ZodType<Stats> = z.object({
  candor: pipSchema,
  prudence: pipSchema,
  guile: pipSchema,
})

export const abilityEffectSchema: z.ZodType<AbilityEffect> =
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('speaks-last') }),
    z.object({ kind: z.literal('licensed-tongue') }),
    z.object({ kind: z.literal('must-quantify') }),
    z.object({ kind: z.literal('must-cite-precedent') }),
    z.object({ kind: z.literal('reveals-hidden-cost') }),
    z.object({ kind: z.literal('plain-speech') }),
    z.object({ kind: z.literal('reframes-as-campaign') }),
  ])

export const abilitySchema: z.ZodType<Ability> = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(90),
  effect: abilityEffectSchema,
})

export const voiceSchema: z.ZodType<Voice> = z.object({
  register: z.string().min(1),
  tics: z.array(z.string().min(1)).min(2).max(4),
  sampleLines: z.array(z.string().min(1)).min(2).max(3),
})

export const spriteStateSchema: z.ZodType<SpriteState> = z.enum([
  'neutral',
  'pleased',
  'appalled',
  'scheming',
])

export const counselorSchema: z.ZodType<Counselor> = z.object({
  id: idSchema,
  name: z.string().min(1),
  title: z.string().min(1),
  faction: factionSchema,
  stats: statsSchema,
  ability: abilitySchema,
  agenda: z.string().min(1),
  voice: voiceSchema,
  publicStance: z.string().min(1),
  sprite: z.object({
    sheet: z.string().min(1),
    frames: z.object({
      neutral: z.number().int().nonnegative(),
      pleased: z.number().int().nonnegative(),
      appalled: z.number().int().nonnegative(),
      scheming: z.number().int().nonnegative(),
    }),
  }),
  isCustom: z.boolean(),
})

export const stageSchema: z.ZodType<Stage> = z.enum([
  'composing',
  'seating',
  'petition',
  'deliberation',
  'vote',
  'decree',
  'aftermath',
])

export const petitionSchema: z.ZodType<Petition> = z.object({
  counselorId: idSchema,
  text: z.string(),
  complete: z.boolean(),
})

export const exchangeSchema: z.ZodType<Exchange> = z.object({
  counselorId: idSchema,
  targetId: idSchema,
  text: z.string(),
  order: z.number().int().nonnegative(),
})

export const voteSchema: z.ZodType<Vote> = z.object({
  voterId: idSchema,
  forId: idSchema,
  rationale: z.string(),
})

export const decreeSchema: z.ZodType<Decree> = z.object({
  text: z.string().min(1).max(MAX_DECREE_LENGTH),
  sidedWithId: idSchema.optional(),
  issuedAt: isoDateSchema,
})

export const reactionSchema: z.ZodType<Reaction> = z.object({
  counselorId: idSchema,
  mood: spriteStateSchema,
  line: z.string(),
  favorDelta: z.number().int().min(-2).max(2),
})

export const audienceSchema: z.ZodType<Audience> = z.object({
  id: idSchema,
  question: z.string().max(MAX_QUESTION_LENGTH),
  seated: z.array(idSchema),
  stage: stageSchema,
  petitions: z.array(petitionSchema),
  deliberation: z.array(exchangeSchema),
  votes: z.array(voteSchema),
  decree: decreeSchema.optional(),
  reactions: z.array(reactionSchema),
  createdAt: isoDateSchema,
})

export const reignSchema: z.ZodType<Reign> = z.object({
  id: idSchema,
  monarchName: z.string().min(1),
  favor: z.record(idSchema, z.number().int().min(MIN_FAVOR).max(MAX_FAVOR)),
  heardCount: z.record(idSchema, z.number().int().nonnegative()),
  revealedAgendas: z.array(idSchema),
  history: z.array(
    z.object({
      question: z.string(),
      decree: z.string(),
      at: isoDateSchema,
    }),
  ),
  createdAt: isoDateSchema,
})
