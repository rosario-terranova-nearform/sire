import { describe, expect, it } from 'vitest'
import {
  audienceReducer,
  canAdvance,
  createAudience,
  isLegalTransition,
  resolveSpeakingOrder,
  type AudienceAction,
} from './audience-machine'
import { STAGES, type Audience, type Stage } from '@/domain/audience'
import { COUNSELORS_BY_ID } from '@/content/counselors'

const SEATED = ['vane', 'marrow', 'hob']

const base = (): Audience =>
  createAudience({
    id: 'aud-1',
    createdAt: '2026-08-06T09:00:00.000Z',
    question: 'Should we march on Harrow before the thaw?',
    seated: SEATED,
  })

/** An audience parked at `stage` with that stage's entry conditions met. */
function at(stage: Stage): Audience {
  const audience = base()
  const petitions = SEATED.map((id) => ({
    counselorId: id,
    text: 'Counsel.',
    complete: true,
  }))
  const deliberation = SEATED.map((id, order) => ({
    counselorId: id,
    targetId: SEATED[(order + 1) % SEATED.length],
    text: 'You are wrong, and here is the cost.',
    order,
  }))
  const votes = SEATED.map((id, i) => ({
    voterId: id,
    forId: SEATED[(i + 1) % SEATED.length],
    rationale: 'Least ruinous.',
  }))

  switch (stage) {
    case 'composing':
      return { ...audience, stage, seated: [] }
    case 'seating':
      return { ...audience, stage }
    case 'petition':
      return { ...audience, stage }
    case 'deliberation':
      return { ...audience, stage, petitions }
    case 'vote':
      return { ...audience, stage, petitions, deliberation }
    case 'decree':
      return { ...audience, stage, petitions, deliberation, votes }
    case 'aftermath':
      return {
        ...audience,
        stage,
        petitions,
        deliberation,
        votes,
        decree: {
          text: 'The levy stands. The tax does not.',
          issuedAt: '2026-08-06T10:00:00.000Z',
        },
      }
  }
}

const advance = (audience: Audience) =>
  audienceReducer(audience, { type: 'advance' })

describe('createAudience', () => {
  it('starts in composing with empty transcript arrays', () => {
    const audience = createAudience({
      id: 'aud-1',
      createdAt: '2026-08-06T09:00:00.000Z',
    })
    expect(audience.stage).toBe('composing')
    expect(audience.question).toBe('')
    expect(audience.seated).toEqual([])
    expect(audience.petitions).toEqual([])
    expect(audience.deliberation).toEqual([])
    expect(audience.votes).toEqual([])
    expect(audience.reactions).toEqual([])
    expect(audience.decree).toBeUndefined()
  })
})

describe('stage transitions (§5)', () => {
  it('declares exactly the forward-by-one transitions legal', () => {
    const legal = STAGES.flatMap((from) =>
      STAGES.filter((to) => isLegalTransition(from, to)).map(
        (to) => `${from}->${to}`,
      ),
    )
    expect(legal).toEqual([
      'composing->seating',
      'seating->petition',
      'petition->deliberation',
      'deliberation->vote',
      'vote->decree',
      'decree->aftermath',
    ])
  })

  it('walks the whole flow when each stage is satisfied', () => {
    // `at(next)` holds everything produced up to and including `stage`, so
    // rewinding its label gives a state that has just satisfied `stage`.
    const walked = STAGES.slice(0, -1).map(
      (stage, i) => advance({ ...at(STAGES[i + 1]), stage }).stage,
    )
    expect(walked).toEqual([
      'seating',
      'petition',
      'deliberation',
      'vote',
      'decree',
      'aftermath',
    ])
  })

  it('never advances past aftermath', () => {
    const end = at('aftermath')
    expect(advance(end)).toBe(end)
  })

  it('will not leave composing without a question', () => {
    const blank = { ...at('composing'), question: '   ' }
    expect(advance(blank)).toBe(blank)
    expect(canAdvance(blank)).toBe(false)
  })

  it.each([
    ['too few', ['vane', 'marrow']],
    ['too many', ['vane', 'marrow', 'hob', 'grin', 'wren', 'verity']],
  ])('will not leave seating with %s counselors', (_label, seated) => {
    const state = { ...at('seating'), seated }
    expect(advance(state)).toBe(state)
  })

  it('will not leave petition while a stream is still open', () => {
    const state = {
      ...at('deliberation'),
      stage: 'petition' as const,
      petitions: [
        { counselorId: 'vane', text: 'a', complete: true },
        { counselorId: 'marrow', text: 'b', complete: false },
        { counselorId: 'hob', text: 'c', complete: true },
      ],
    }
    expect(advance(state)).toBe(state)
  })

  it('will not leave deliberation until every seated counselor has spoken', () => {
    const state = at('vote')
    const short = {
      ...state,
      stage: 'deliberation' as const,
      deliberation: state.deliberation.slice(0, 2),
    }
    expect(advance(short)).toBe(short)
  })

  it('will not leave vote with a missing voter', () => {
    const state = at('decree')
    const short = {
      ...state,
      stage: 'vote' as const,
      votes: state.votes.slice(0, 2),
    }
    expect(advance(short)).toBe(short)
  })

  it('will not leave decree until the monarch has ruled', () => {
    const state = at('decree')
    expect(advance(state)).toBe(state)
  })
})

describe('actions outside their own stage are rejected', () => {
  const actions: Array<[string, Stage, AudienceAction]> = [
    ['set-question', 'composing', { type: 'set-question', question: 'Well?' }],
    ['seat-council', 'seating', { type: 'seat-council', seated: SEATED }],
    [
      'petition-chunk',
      'petition',
      { type: 'petition-chunk', counselorId: 'vane', text: 'Strike.' },
    ],
    [
      'petition-complete',
      'petition',
      { type: 'petition-complete', counselorId: 'vane' },
    ],
    [
      'add-exchange',
      'deliberation',
      {
        type: 'add-exchange',
        exchange: { counselorId: 'vane', targetId: 'marrow', text: 'No.' },
      },
    ],
    [
      'record-votes',
      'vote',
      {
        type: 'record-votes',
        votes: SEATED.map((id, i) => ({
          voterId: id,
          forId: SEATED[(i + 1) % SEATED.length],
          rationale: 'Least ruinous.',
        })),
      },
    ],
    [
      'issue-decree',
      'decree',
      {
        type: 'issue-decree',
        decree: { text: 'So be it.', issuedAt: '2026-08-06T10:00:00.000Z' },
      },
    ],
    [
      'record-reactions',
      'aftermath',
      {
        type: 'record-reactions',
        reactions: [
          {
            counselorId: 'vane',
            mood: 'appalled' as const,
            line: 'Cowardice.',
            favorDelta: -1,
          },
        ],
      },
    ],
  ]

  it.each(actions)('%s only applies in %s', (_name, ownStage, action) => {
    for (const stage of STAGES) {
      const state = at(stage)
      const next = audienceReducer(state, action)
      if (stage === ownStage) {
        expect(next).not.toBe(state)
      } else {
        expect(next).toBe(state)
      }
    }
  })
})

describe('composing and seating', () => {
  it('rejects a question over 300 chars', () => {
    const state = at('composing')
    expect(
      audienceReducer(state, {
        type: 'set-question',
        question: 'a'.repeat(301),
      }),
    ).toBe(state)
  })

  it('rejects a council with duplicate counselors', () => {
    const state = at('seating')
    expect(
      audienceReducer(state, {
        type: 'seat-council',
        seated: ['vane', 'vane', 'hob'],
      }),
    ).toBe(state)
  })
})

describe('petitions (§5.3)', () => {
  it('accumulates streamed chunks per counselor', () => {
    let state = at('petition')
    state = audienceReducer(state, {
      type: 'petition-chunk',
      counselorId: 'vane',
      text: 'Strike ',
    })
    state = audienceReducer(state, {
      type: 'petition-chunk',
      counselorId: 'marrow',
      text: 'Four thousand crowns.',
    })
    state = audienceReducer(state, {
      type: 'petition-chunk',
      counselorId: 'vane',
      text: 'in spring, sire.',
    })

    expect(state.petitions).toEqual([
      { counselorId: 'vane', text: 'Strike in spring, sire.', complete: false },
      {
        counselorId: 'marrow',
        text: 'Four thousand crowns.',
        complete: false,
      },
    ])
  })

  it('ignores chunks from a counselor who is not seated', () => {
    const state = at('petition')
    expect(
      audienceReducer(state, {
        type: 'petition-chunk',
        counselorId: 'wren',
        text: 'I know things.',
      }),
    ).toBe(state)
  })

  it('ignores chunks after the stream has closed', () => {
    let state = at('petition')
    state = audienceReducer(state, {
      type: 'petition-chunk',
      counselorId: 'vane',
      text: 'Strike.',
    })
    const closed = audienceReducer(state, {
      type: 'petition-complete',
      counselorId: 'vane',
    })
    expect(
      audienceReducer(closed, {
        type: 'petition-chunk',
        counselorId: 'vane',
        text: ' Again.',
      }),
    ).toBe(closed)
  })

  it('records an empty petition for a counselor who never streamed', () => {
    const state = audienceReducer(at('petition'), {
      type: 'petition-complete',
      counselorId: 'hob',
    })
    expect(state.petitions).toEqual([
      { counselorId: 'hob', text: '', complete: true },
    ])
  })
})

describe('deliberation (§5.4)', () => {
  it('assigns turn order in arrival sequence', () => {
    let state = at('deliberation')
    state = audienceReducer(state, {
      type: 'add-exchange',
      exchange: { counselorId: 'vane', targetId: 'marrow', text: 'Coward.' },
    })
    state = audienceReducer(state, {
      type: 'add-exchange',
      exchange: { counselorId: 'marrow', targetId: 'vane', text: 'Priced?' },
    })
    expect(state.deliberation.map((e) => [e.counselorId, e.order])).toEqual([
      ['vane', 0],
      ['marrow', 1],
    ])
  })

  it('rejects a turn with no seated target, or one aimed at itself', () => {
    const state = at('deliberation')
    expect(
      audienceReducer(state, {
        type: 'add-exchange',
        exchange: { counselorId: 'vane', targetId: 'wren', text: 'You.' },
      }),
    ).toBe(state)
    expect(
      audienceReducer(state, {
        type: 'add-exchange',
        exchange: { counselorId: 'vane', targetId: 'vane', text: 'Me.' },
      }),
    ).toBe(state)
  })
})

describe('votes (§5.5)', () => {
  const tally = (votes: Array<[string, string]>) => ({
    type: 'record-votes' as const,
    votes: votes.map(([voterId, forId]) => ({
      voterId,
      forId,
      rationale: 'Least ruinous.',
    })),
  })

  it('accepts a complete, self-vote-free tally', () => {
    const state = audienceReducer(
      at('vote'),
      tally([
        ['vane', 'marrow'],
        ['marrow', 'hob'],
        ['hob', 'vane'],
      ]),
    )
    expect(state.votes).toHaveLength(3)
  })

  it('keeps a hung council intact rather than breaking the tie', () => {
    const state = audienceReducer(
      at('vote'),
      tally([
        ['vane', 'hob'],
        ['marrow', 'hob'],
        ['hob', 'vane'],
      ]),
    )
    expect(state.votes.map((v) => v.forId)).toEqual(['hob', 'hob', 'vane'])
    expect(canAdvance(state)).toBe(true)
  })

  it.each([
    [
      'a self-vote',
      [
        ['vane', 'vane'],
        ['marrow', 'hob'],
        ['hob', 'vane'],
      ],
    ],
    [
      'a missing voter',
      [
        ['vane', 'marrow'],
        ['marrow', 'hob'],
      ],
    ],
    [
      'a double vote',
      [
        ['vane', 'hob'],
        ['vane', 'marrow'],
        ['hob', 'vane'],
      ],
    ],
    [
      'an unseated voter',
      [
        ['wren', 'hob'],
        ['marrow', 'hob'],
        ['hob', 'vane'],
      ],
    ],
    [
      'a vote for an unseated counselor',
      [
        ['vane', 'grin'],
        ['marrow', 'hob'],
        ['hob', 'vane'],
      ],
    ],
  ])('rejects a tally containing %s', (_label, votes) => {
    const state = at('vote')
    expect(
      audienceReducer(state, tally(votes as Array<[string, string]>)),
    ).toBe(state)
  })
})

describe('decree (§5.6) and aftermath (§5.7)', () => {
  it('rejects an empty or over-long decree', () => {
    const state = at('decree')
    for (const text of ['', 'a'.repeat(401)]) {
      expect(
        audienceReducer(state, {
          type: 'issue-decree',
          decree: { text, issuedAt: '2026-08-06T10:00:00.000Z' },
        }),
      ).toBe(state)
    }
  })

  it('rejects siding with a counselor who was not seated', () => {
    const state = at('decree')
    expect(
      audienceReducer(state, {
        type: 'issue-decree',
        decree: {
          text: 'So be it.',
          sidedWithId: 'wren',
          issuedAt: '2026-08-06T10:00:00.000Z',
        },
      }),
    ).toBe(state)
  })

  it('advances to aftermath once the monarch has ruled', () => {
    const ruled = audienceReducer(at('decree'), {
      type: 'issue-decree',
      decree: {
        text: 'The levy stands.',
        sidedWithId: 'hob',
        issuedAt: '2026-08-06T10:00:00.000Z',
      },
    })
    expect(advance(ruled).stage).toBe('aftermath')
  })

  it('rejects a reaction from a counselor who was not seated', () => {
    const state = at('aftermath')
    expect(
      audienceReducer(state, {
        type: 'record-reactions',
        reactions: [
          {
            counselorId: 'grin',
            mood: 'scheming',
            line: 'Ha.',
            favorDelta: 1,
          },
        ],
      }),
    ).toBe(state)
  })
})

describe('resolveSpeakingOrder (§5.4)', () => {
  const ALL = ['vane', 'marrow', 'grin', 'verity', 'wren', 'hob']

  it('puts speaks-last counselors at the end, for every shuffle', () => {
    // Sweep a deterministic rng across its whole range so every permutation
    // Fisher–Yates can produce is exercised.
    for (let step = 0; step < 100; step++) {
      const rng = () => step / 100
      const order = resolveSpeakingOrder(ALL, COUNSELORS_BY_ID, rng)
      expect(order.at(-1)).toBe('wren')
      expect(order).toHaveLength(ALL.length)
      expect(new Set(order)).toEqual(new Set(ALL))
    }
  })

  it('is a permutation of the seated council', () => {
    const seated = ['grin', 'wren', 'hob']
    const order = resolveSpeakingOrder(seated, COUNSELORS_BY_ID, () => 0.5)
    expect([...order].sort()).toEqual([...seated].sort())
    expect(order.at(-1)).toBe('wren')
  })

  it('actually shuffles the non-last speakers', () => {
    const seated = ['vane', 'marrow', 'grin', 'verity', 'hob']
    const orders = new Set(
      Array.from({ length: 50 }, (_, i) =>
        resolveSpeakingOrder(seated, COUNSELORS_BY_ID, () => i / 50).join(','),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  it('drops ids that are not on the roster', () => {
    expect(
      resolveSpeakingOrder(['vane', 'nobody'], COUNSELORS_BY_ID, () => 0),
    ).toEqual(['vane'])
  })
})
