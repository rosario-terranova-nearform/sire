import { describe, expect, it } from 'vitest'
import {
  audienceSchema,
  counselorSchema,
  decreeSchema,
  exchangeSchema,
  petitionSchema,
  reactionSchema,
  reignSchema,
  voteSchema,
} from './schemas'
import type { Counselor } from './counselor'
import type {
  Audience,
  Decree,
  Exchange,
  Petition,
  Reaction,
  Vote,
} from './audience'
import type { Reign } from './reign'

const counselor: Counselor = {
  id: 'vane',
  name: 'Lord Marshal Vane',
  title: 'Marshal of the Host',
  faction: 'martial',
  stats: { candor: 4, prudence: 1, guile: 2 },
  ability: {
    name: 'Call to arms',
    description: 'Recasts any question as a campaign to be won.',
    effect: { kind: 'reframes-as-campaign' },
  },
  agenda: 'Glory, and a larger host.',
  voice: {
    register: 'clipped military imperatives',
    tics: ['counts in banners', "calls hesitation 'rot'"],
    sampleLines: ['Strike in spring, sire.', 'Nine banners closes the matter.'],
  },
  publicStance: 'Wants the host enlarged and committed this season.',
  sprite: {
    sheet: '/sprites/vane.png',
    frames: { neutral: 0, pleased: 1, appalled: 2, scheming: 3 },
  },
  isCustom: false,
}

const petition: Petition = {
  counselorId: 'vane',
  text: 'Strike first, sire.',
  complete: true,
}

const exchange: Exchange = {
  counselorId: 'marrow',
  targetId: 'vane',
  text: 'The Marshal has not priced his own banners.',
  order: 0,
}

const vote: Vote = {
  voterId: 'marrow',
  forId: 'hob',
  rationale: 'He alone counted the cost in grain.',
}

const decree: Decree = {
  text: 'So be it. The levy stands, the tax does not.',
  sidedWithId: 'hob',
  issuedAt: '2026-08-06T10:00:00.000Z',
}

const reaction: Reaction = {
  counselorId: 'vane',
  mood: 'appalled',
  line: 'Then we starve politely, sire.',
  favorDelta: -2,
}

const audience: Audience = {
  id: 'aud-1',
  question: 'Should we march on Harrow before the thaw?',
  seated: ['vane', 'marrow', 'hob'],
  stage: 'aftermath',
  petitions: [petition],
  deliberation: [exchange],
  votes: [vote],
  decree,
  reactions: [reaction],
  createdAt: '2026-08-06T09:00:00.000Z',
}

const reign: Reign = {
  id: 'reign-1',
  monarchName: 'Rosario the Unbothered',
  favor: { vane: -2, hob: 3 },
  heardCount: { vane: 4, hob: 4 },
  revealedAgendas: ['vane'],
  history: [
    {
      question: 'Should we march on Harrow before the thaw?',
      decree: 'So be it.',
      at: '2026-08-06T10:00:00.000Z',
    },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
}

describe('domain schemas', () => {
  it.each([
    ['counselor', counselorSchema, counselor],
    ['petition', petitionSchema, petition],
    ['exchange', exchangeSchema, exchange],
    ['vote', voteSchema, vote],
    ['decree', decreeSchema, decree],
    ['reaction', reactionSchema, reaction],
    ['audience', audienceSchema, audience],
    ['reign', reignSchema, reign],
  ])('round-trips a %s fixture unchanged', (_name, schema, fixture) => {
    expect(schema.parse(fixture)).toEqual(fixture)
  })

  it('accepts an audience with no decree yet', () => {
    const pending: Audience = { ...audience, stage: 'decree' }
    delete pending.decree
    expect(audienceSchema.parse(pending)).not.toHaveProperty('decree')
  })

  it('rejects an unknown faction', () => {
    expect(
      counselorSchema.safeParse({ ...counselor, faction: 'dragons' }).success,
    ).toBe(false)
  })

  it('rejects a stat pip outside 1–5', () => {
    expect(
      counselorSchema.safeParse({
        ...counselor,
        stats: { ...counselor.stats, candor: 6 },
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown ability effect', () => {
    expect(
      counselorSchema.safeParse({
        ...counselor,
        ability: { ...counselor.ability, effect: { kind: 'mind-control' } },
      }).success,
    ).toBe(false)
  })

  it('rejects a favor delta beyond ±2', () => {
    expect(
      reactionSchema.safeParse({ ...reaction, favorDelta: -3 }).success,
    ).toBe(false)
  })

  it('rejects favor outside the -10…+10 clamp', () => {
    expect(
      reignSchema.safeParse({ ...reign, favor: { vane: 11 } }).success,
    ).toBe(false)
  })

  it('rejects a decree over 400 chars', () => {
    expect(
      decreeSchema.safeParse({ ...decree, text: 'a'.repeat(401) }).success,
    ).toBe(false)
  })

  it('rejects a non-ISO timestamp', () => {
    expect(
      decreeSchema.safeParse({ ...decree, issuedAt: 'yesterday' }).success,
    ).toBe(false)
  })
})
