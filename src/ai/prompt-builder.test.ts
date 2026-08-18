import { describe, expect, it } from 'vitest'
import {
  abilityInstruction,
  buildAftermathMessages,
  buildDeliberationMessages,
  buildPetitionMessages,
  buildSystemPrompt,
  buildVoteMessages,
} from './prompt-builder'
import { BANNED_PHRASES } from './validate-exchange'
import { COUNSELORS, COUNSELORS_BY_ID } from '@/content/counselors'
import type { AbilityEffect } from '@/domain/counselor'
import { makeAudience, makeReign, SEATED } from '@/test/ai-fixtures'

const reign = makeReign()
const roster = COUNSELORS_BY_ID
const vane = COUNSELORS_BY_ID.vane
const marrow = COUNSELORS_BY_ID.marrow
const hob = COUNSELORS_BY_ID.hob

const deliberating = makeAudience({
  stage: 'deliberation',
  petitions: [
    {
      counselorId: 'vane',
      text: 'Open them and march, sire. Nine banners, a dry road, done by harvest.',
      complete: true,
    },
    {
      counselorId: 'marrow',
      text: 'Four thousand bushels, sire, and the salt tax rises a third to replace them.',
      complete: true,
    },
    {
      counselorId: 'hob',
      text: 'Begging pardon, sire, but that grain is my village eating in March.',
      complete: true,
    },
  ],
  deliberation: [
    {
      counselorId: 'vane',
      targetId: 'marrow',
      text: 'Marrow prices a siege she has never stood in.',
      order: 0,
    },
  ],
})

const ruled = makeAudience({
  ...deliberating,
  stage: 'aftermath',
  votes: [
    {
      voterId: 'vane',
      forId: 'hob',
      rationale: 'He at least wants it settled.',
    },
    { voterId: 'marrow', forId: 'hob', rationale: 'Cheapest of a bad field.' },
    {
      voterId: 'hob',
      forId: 'marrow',
      rationale: 'She counts. Nobody else counts.',
    },
  ],
  decree: {
    text: 'Open half the granaries and hold the rest until the thaw is certain.',
    sidedWithId: 'hob',
    issuedAt: '2026-08-06T09:30:00.000Z',
  },
})

describe('the system prompt (§6.1)', () => {
  it('matches the skeleton', () => {
    expect(buildSystemPrompt(marrow, reign)).toMatchSnapshot()
  })

  it('names the monarch, the office and the private agenda', () => {
    const prompt = buildSystemPrompt(marrow, reign)

    expect(prompt).toContain('Keeper Marrow, Mistress of Coin')
    expect(prompt).toContain(reign.monarchName)
    expect(prompt).toContain(marrow.publicStance)
    expect(prompt).toContain(marrow.agenda)
    expect(prompt).toContain('You never state the private part outright.')
  })

  it('carries the last decrees as memory (§3)', () => {
    const remembered = makeReign({
      history: [
        {
          question: 'Should the bridge at Harrow be burned?',
          decree: 'Burn it, and bill the Duke for the timber.',
          at: '2026-08-02T09:00:00.000Z',
        },
      ],
    })

    const prompt = buildSystemPrompt(marrow, remembered)

    expect(prompt).toContain('WHAT THIS COURT REMEMBERS')
    expect(prompt).toContain('Burn it, and bill the Duke for the timber.')
    expect(buildSystemPrompt(marrow, reign)).not.toContain(
      'WHAT THIS COURT REMEMBERS',
    )
  })

  it('omits the ability block for engine-level abilities', () => {
    const wren = COUNSELORS_BY_ID.wren

    expect(wren.ability.effect.kind).toBe('speaks-last')
    expect(buildSystemPrompt(wren, reign)).not.toContain('ABILITY')
  })
})

describe('ability instructions (§6.2)', () => {
  const kinds: AbilityEffect['kind'][] = [
    'speaks-last',
    'licensed-tongue',
    'must-quantify',
    'must-cite-precedent',
    'reveals-hidden-cost',
    'plain-speech',
    'reframes-as-campaign',
  ]

  it('resolves every effect in the union', () => {
    for (const kind of kinds) {
      const instruction = abilityInstruction({ kind } as AbilityEffect)
      if (kind === 'speaks-last') {
        expect(instruction).toBeNull()
      } else {
        expect(instruction).toBeTruthy()
      }
    }
  })

  it('holds the fool inside §9 limits', () => {
    const instruction = abilityInstruction({ kind: 'licensed-tongue' })

    expect(instruction).toContain('Mock the ruling and the reasoning only')
  })

  it('matches the table', () => {
    expect(
      Object.fromEntries(
        kinds.map((kind) => [
          kind,
          abilityInstruction({ kind } as AbilityEffect),
        ]),
      ),
    ).toMatchSnapshot()
  })
})

describe('buildPetitionMessages (§5.3)', () => {
  it('matches the snapshot', () => {
    expect(buildPetitionMessages(vane, deliberating, reign)).toMatchSnapshot()
  })

  it('asks the question and caps the length', () => {
    const [, user] = buildPetitionMessages(vane, deliberating, reign)

    expect(user.content).toContain(deliberating.question)
    expect(user.content).toContain('2 to 4 sentences')
  })

  // The anchoring firewall. If this test ever fails, the app has stopped being
  // a council and started being a chorus.
  it('leaks nothing about any other counselor', () => {
    for (const counselor of COUNSELORS) {
      const audience = makeAudience({
        ...deliberating,
        seated: [...SEATED, counselor.id].slice(0, 5),
      })
      const serialized = JSON.stringify(
        buildPetitionMessages(counselor, audience, reign),
      )

      for (const other of COUNSELORS) {
        if (other.id === counselor.id) continue

        expect(serialized).not.toContain(other.name)
        expect(serialized).not.toContain(other.publicStance)
        expect(serialized).not.toContain(other.agenda)
        for (const line of other.voice.sampleLines) {
          expect(serialized).not.toContain(line)
        }
      }

      for (const petition of audience.petitions) {
        if (petition.counselorId === counselor.id) continue
        expect(serialized).not.toContain(petition.text)
      }

      for (const exchange of audience.deliberation) {
        expect(serialized).not.toContain(exchange.text)
      }
    }
  })

  // §5.7 / T-23 — favor demonstrably changes the petition prompt.
  it('leaves an in-favor petition unmodified', () => {
    const [, user] = buildPetitionMessages(vane, deliberating, reign)
    expect(user.content).not.toContain('out of the monarch')
    expect(user.content).not.toContain('high in the monarch')
  })

  it('makes a counselor terse when favor is spent (≤ -5)', () => {
    const spent = makeReign({ favor: { [vane.id]: -6 } })
    const [, user] = buildPetitionMessages(vane, deliberating, spent)
    expect(user.content).toContain('out of the monarch')
    expect(user.content).toContain('barest counsel')
  })

  it('lets a favored counselor volunteer an extra line (≥ +7)', () => {
    const favored = makeReign({ favor: { [vane.id]: 8 } })
    const [, user] = buildPetitionMessages(vane, deliberating, favored)
    expect(user.content).toContain('high in the monarch')
    expect(user.content).toContain('one extra line')
  })

  it('exempts the fool from favor posture at either extreme', () => {
    const grin = COUNSELORS_BY_ID.grin
    for (const favor of [-9, 9]) {
      const reign = makeReign({ favor: { [grin.id]: favor } })
      const [, user] = buildPetitionMessages(grin, deliberating, reign)
      expect(user.content).not.toContain('out of the monarch')
      expect(user.content).not.toContain('high in the monarch')
    }
  })
})

describe('buildDeliberationMessages (§5.4)', () => {
  it('matches the snapshot', () => {
    expect(
      buildDeliberationMessages(hob, deliberating, reign, roster),
    ).toMatchSnapshot()
  })

  it('hands over every petition and every rival interest', () => {
    const [, user] = buildDeliberationMessages(hob, deliberating, reign, roster)
    const content = String(user.content)

    for (const petition of deliberating.petitions) {
      expect(content).toContain(petition.text)
    }
    expect(content).toContain(vane.publicStance)
    expect(content).toContain(marrow.publicStance)
    // Their own petition is theirs, not a rival's.
    expect(content).toContain('You said:')
    expect(content).not.toContain(`${hob.name}, ${hob.title} — `)
  })

  it('shows the floor so far, with who was disputed', () => {
    const [, user] = buildDeliberationMessages(hob, deliberating, reign, roster)

    expect(String(user.content)).toContain(
      `${vane.name}, against ${marrow.name}:`,
    )
  })

  it('bans the agreeable phrases in the system prompt', () => {
    const [system] = buildDeliberationMessages(hob, deliberating, reign, roster)

    for (const phrase of BANNED_PHRASES) {
      expect(String(system.content)).toContain(phrase)
    }
  })

  it('appends the stricter reminder on a retry (T-11)', () => {
    const messages = buildDeliberationMessages(
      hob,
      deliberating,
      reign,
      roster,
      {
        retry: {
          rejectedText: 'I agree with the Keeper entirely, sire.',
          reasons: ['You were agreeable.'],
        },
      },
    )

    expect(messages).toHaveLength(4)
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'I agree with the Keeper entirely, sire.',
    })
    expect(String(messages[3].content)).toContain('That will not do.')
    expect(String(messages[3].content)).toContain('You were agreeable.')
  })
})

describe('buildVoteMessages (§5.5)', () => {
  it('matches the snapshot', () => {
    expect(buildVoteMessages(ruled, reign, roster)).toMatchSnapshot()
  })

  it('lists exactly the seated ids and forbids self-votes', () => {
    const [system, user] = buildVoteMessages(ruled, reign, roster)

    expect(String(user.content)).toContain('vane, marrow, hob')
    expect(String(user.content)).not.toContain('id: wren')
    expect(String(system.content)).toContain(
      'No counselor may vote for themselves',
    )
  })
})

describe('buildAftermathMessages (§5.7)', () => {
  it('matches the snapshot', () => {
    expect(buildAftermathMessages(ruled, reign, roster)).toMatchSnapshot()
  })

  it('gives the clerk the decree and the four moods', () => {
    const [system, user] = buildAftermathMessages(ruled, reign, roster)

    expect(String(user.content)).toContain(ruled.decree?.text)
    expect(String(user.content)).toContain(`sided with ${hob.name}`)
    expect(String(system.content)).toContain(
      'neutral, pleased, appalled, scheming',
    )
  })

  it('says plainly when the monarch has not ruled', () => {
    const [, user] = buildAftermathMessages(deliberating, reign, roster)

    expect(String(user.content)).toContain('The monarch has not ruled.')
  })
})
