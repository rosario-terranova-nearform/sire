import type { Audience, Exchange, Reaction, Vote } from '@/domain/audience'
import type { SpriteState } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from './counselors'

/**
 * The recording (§7.1). When there is no key, or when every model in a chain
 * has failed, the court still sits — it just sits as a canned transcript with a
 * visible banner. The app never shows a raw error page.
 *
 * Every one of the six seeded counselors has canned content, so demo mode works
 * for *any* legal seating, not only the one in `DEMO_AUDIENCE`.
 */

export const DEMO_BANNER_COPY = 'The court is a recording today.'

export const DEMO_QUESTION =
  "The Duke of Harrow offers his daughter's hand and an end to the border war. Should I accept?"

/** The five seated in `DEMO_AUDIENCE`. Any legal council works, though. */
export const DEMO_SEATED: readonly string[] = [
  'vane',
  'marrow',
  'grin',
  'wren',
  'hob',
]

export const DEMO_DECREE_TEXT =
  'Let the marriage be made — but the girl is asked first, and the ridge is surveyed before she signs. If Harrow objects to either, Vane may have his spring.'

interface DemoExchange {
  targetId: string
  text: string
}

interface DemoVote {
  forId: string
  rationale: string
}

interface DemoCounsel {
  petition: string
  /** Tried in order; the first whose target is seated is used. */
  exchanges: readonly DemoExchange[]
  /** Last resort when none of the preferred targets is at the table. */
  fallbackExchange: (targetName: string) => string
  votes: readonly DemoVote[]
  fallbackVote: (targetName: string) => string
  reaction: { mood: SpriteState; line: string; favorDelta: number }
}

const DEMO_COUNSEL: Readonly<Record<string, DemoCounsel>> = {
  vane: {
    petition:
      'A wedding is a siege with better food, sire. Accept, and Harrow keeps the ridge he stole from your father; refuse, and I take it back by midsummer on a dry road. Marry the girl after the field, not instead of it.',
    exchanges: [
      {
        targetId: 'marrow',
        text: 'Marrow counts crowns and calls it strategy. Her saving buys Harrow two winters to fortify that ridge, and then I take the same ground at three times the price in men. Pay her sum now, sire, and you will pay mine later.',
      },
      {
        targetId: 'hob',
        text: 'Hob wants his boy home. So do I — home from a war he won, not one we postponed. A truce signed from weakness only means the same village buries the same lads five years later.',
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} counsels waiting, which is what the losing side always counsels. Every season we sit is a season Harrow spends digging. Give me the road dry and the matter closes by harvest, sire.`,
    votes: [
      {
        forId: 'marrow',
        rationale:
          'Her arithmetic is cowardly, but it takes the ridge. Take the dowry, then take the ground.',
      },
      {
        forId: 'hob',
        rationale:
          'The old man knows what a war costs. He is wrong about who pays it.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName} at least proposes doing something. Hesitation is rot.`,
    reaction: {
      mood: 'pleased',
      line: 'A truce with a blade behind it. I can work with that, sire.',
      favorDelta: 1,
    },
  },

  marrow: {
    petition:
      'The war costs eleven thousand crowns a season, sire, and the dowry is offered at four. Accept, and the ledger closes twenty-six thousand to the good by winter. A daughter is the cheapest border I have ever been offered.',
    exchanges: [
      {
        targetId: 'vane',
        text: "Vane's nine banners cost four thousand crowns a week before one arrow is loosed, and he has never returned a campaign under estimate — not once in eleven years. The Duke offers the same border for the price of a feast. I have priced glory, sire. It does not balance.",
      },
      {
        targetId: 'grin',
        text: 'Grin makes a joke of the dowry because a joke costs four crowns and a bell. Four thousand is what is on the table, and mockery has never once filled a column.',
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} has not put a single figure to any of this. Eleven thousand a season, sire, against a dowry of four. Say the subtraction aloud and the argument ends.`,
    votes: [
      {
        forId: 'hob',
        rationale:
          'Eleven boys and eleven thousand crowns argue the same side. Rare, and cheap.',
      },
      {
        forId: 'wren',
        rationale:
          'She reads the will, not the dowry. That is worth two clerks.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName} costs the vault least. That is the whole of my reasoning.`,
    reaction: {
      mood: 'appalled',
      line: 'A survey, sire? Two hundred crowns to measure a hill we are given.',
      favorDelta: -1,
    },
  },

  grin: {
    petition:
      'Ha! Buy peace with a girl and call it statecraft, my king. She gets a crown, you get a quiet border, and the Duke gets a spy in your bed who calls you husband. Sign it, sign it — only do not pretend it was love that moved you.',
    exchanges: [
      {
        targetId: 'wren',
        text: 'Wren has known about the second daughter since Tuesday and saved it for last, my king — that is how she takes her fee. She sells you a fright and calls it loyalty. Ask her what the elder girl paid for her silence.',
      },
      {
        targetId: 'vane',
        text: 'Vane wants a wedding and a war, which is two feasts and one funeral. He has never once been asked to carry the coffin. Nine banners, my king, and not one of them his own.',
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} says it so prettily, my king. Ask it again with the door shut and see how it sounds.`,
    votes: [
      {
        forId: 'wren',
        rationale:
          'The spider is right, which frightens me worse than the Duke does.',
      },
      {
        forId: 'hob',
        rationale:
          'The only one here who pays for his own advice. Terrible business model.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName}, because the rest of you lied more prettily.`,
    reaction: {
      mood: 'scheming',
      line: 'He asked her! Ha! Now watch this court learn what she says.',
      favorDelta: 1,
    },
  },

  verity: {
    petition:
      'Queen Iseult of the Vale sold her sister for a truce, sire, and the temple still reads her name on the day of penitents. It is not whether the war ends. It is whether the girl was asked, and whether you can kneel afterwards.',
    exchanges: [
      {
        targetId: 'marrow',
        text: 'Marrow has priced a living girl at four thousand crowns and called the column balanced. Iseult of the Vale balanced hers too. The temple keeps a different ledger, sire, and it does not forgive a subtraction.',
      },
      {
        targetId: 'grin',
        text: "Grin makes a joke of her because a joke costs him nothing. She is not a coin to be spent. Iseult's court laughed as well, right up to the day of penitents.",
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} speaks of the border and never once of the girl. Bishop-King Aldric walked that same road, sire, and the temple will not say his name aloud.`,
    votes: [
      {
        forId: 'hob',
        rationale:
          'The commons carry this decree. Only Hob has asked what it weighs.',
      },
      {
        forId: 'wren',
        rationale: 'She names the sin, even if she means to sell it later.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName} is wrong for reasons the temple can at least forgive.`,
    reaction: {
      mood: 'neutral',
      line: 'You asked her name before her hand. It is a beginning.',
      favorDelta: 1,
    },
  },

  wren: {
    petition:
      "No one has mentioned that the Duke has two daughters, sire, and offers you the younger. The elder is already promised to Harrow's other neighbour, with the ridge as her portion. Accept, and by spring you are defending your own wife's inheritance against her sister's husband.",
    exchanges: [
      {
        targetId: 'marrow',
        text: "Keeper Marrow's ledger has no column for the younger daughter's claim, which is the only reason the Duke set his price so low. She has read the dowry and not the will. I would read the will, sire.",
      },
      {
        targetId: 'vane',
        text: "The Marshal wants the ridge by midsummer, and by midsummer the ridge belongs to the elder sister's husband, who has four hundred horse and a grievance. He would be marching into a family quarrel, sire, on your behalf.",
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} has not asked why the Duke is in such a hurry. I have. I would not repeat the answer in this room, sire.`,
    votes: [
      {
        forId: 'grin',
        rationale:
          'The fool said my price out loud. Reward that; he will be useful.',
      },
      {
        forId: 'hob',
        rationale: 'He will be alive next winter. Half this table will not.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName}, and I would like it noted that I said so first.`,
    reaction: {
      mood: 'scheming',
      line: 'Survey the ridge. Yes, sire. I will choose the surveyor.',
      favorDelta: 1,
    },
  },

  hob: {
    petition:
      'Begging pardon, sire, but a wedding costs my village nothing and a war costs it eleven boys. We buried nine last spring and the seed corn went into the ground with them. Take the girl, and let the lads keep their hands.',
    exchanges: [
      {
        targetId: 'vane',
        text: "The Marshal says midsummer like it costs him nothing. It's my boy carries that spear and my barn feeds his horses on the way through. You can't eat a banner, sire. We tried, the year the river froze.",
      },
      {
        targetId: 'marrow',
        text: 'Keeper Marrow saves twenty-six thousand crowns and none of it comes down the hill to us. Last time she saved, the salt went up a third and we salted nothing. Save it on the ridge, not on the barn.',
      },
    ],
    fallbackExchange: (targetName) =>
      `${targetName} won't be doing the digging, sire. I will, and my boy after me. That's the whole of what I know.`,
    votes: [
      {
        forId: 'marrow',
        rationale: 'She counts, at least. Nobody else at this table counts.',
      },
      {
        forId: 'wren',
        rationale:
          'She knew about the second girl. Frightening woman. Right, though.',
      },
    ],
    fallbackVote: (targetName) =>
      `${targetName}. It's the one that buries fewest of mine.`,
    reaction: {
      mood: 'pleased',
      line: 'The lads keep their hands and I keep my boy. Bless you, sire.',
      favorDelta: 2,
    },
  },
}

/** A counselor with no canned content — a custom one (T-21), say. */
const UNRECORDED_PETITION =
  'Forgive me, sire. My voice was not in the chamber the day this was recorded.'

const UNRECORDED_REACTION: Omit<Reaction, 'counselorId'> = {
  mood: 'neutral',
  line: 'The recording does not say, sire.',
  favorDelta: 0,
}

function nameOf(counselorId: string): string {
  return COUNSELORS_BY_ID[counselorId]?.name ?? 'the counselor'
}

export function demoPetition(counselorId: string): string {
  return DEMO_COUNSEL[counselorId]?.petition ?? UNRECORDED_PETITION
}

/**
 * A canned rebuttal that is guaranteed to name a counselor who is actually
 * seated — the engine rejects any exchange whose target is not at the table.
 */
export function demoExchange(
  counselorId: string,
  seated: readonly string[],
): Omit<Exchange, 'order'> | null {
  const others = seated.filter((id) => id !== counselorId)
  if (others.length === 0) return null

  const counsel = DEMO_COUNSEL[counselorId]
  const preferred = counsel?.exchanges.find((entry) =>
    others.includes(entry.targetId),
  )
  if (preferred !== undefined) {
    return {
      counselorId,
      targetId: preferred.targetId,
      text: preferred.text,
    }
  }

  const targetId = others[0]
  const targetName = nameOf(targetId)
  return {
    counselorId,
    targetId,
    text:
      counsel?.fallbackExchange(targetName) ??
      `${targetName} is mistaken, sire, and the recording does not say why.`,
  }
}

export function demoVote(
  voterId: string,
  seated: readonly string[],
): Vote | null {
  const others = seated.filter((id) => id !== voterId)
  if (others.length === 0) return null

  const counsel = DEMO_COUNSEL[voterId]
  const preferred = counsel?.votes.find((entry) => others.includes(entry.forId))
  if (preferred !== undefined) {
    return { voterId, forId: preferred.forId, rationale: preferred.rationale }
  }

  const forId = others[0]
  const targetName = nameOf(forId)
  return {
    voterId,
    forId,
    rationale:
      counsel?.fallbackVote(targetName) ?? `${targetName}, on the recording.`,
  }
}

export function demoReaction(counselorId: string): Reaction {
  const reaction = DEMO_COUNSEL[counselorId]?.reaction ?? UNRECORDED_REACTION
  return { counselorId, ...reaction }
}

export function demoPetitions(seated: readonly string[]) {
  return seated.map((id) => ({
    counselorId: id,
    text: demoPetition(id),
    complete: true,
  }))
}

/** Canned floor, in a legal speaking order: `speaks-last` counselors last. */
export function demoDeliberation(seated: readonly string[]): Exchange[] {
  const speaksLast = (id: string) =>
    COUNSELORS_BY_ID[id]?.ability.effect.kind === 'speaks-last'

  const order = [
    ...seated.filter((id) => !speaksLast(id)),
    ...seated.filter(speaksLast),
  ]

  return order
    .map((id) => demoExchange(id, seated))
    .filter((entry): entry is Omit<Exchange, 'order'> => entry !== null)
    .map((entry, order) => ({ ...entry, order }))
}

export function demoVotes(seated: readonly string[]): Vote[] {
  return seated
    .map((id) => demoVote(id, seated))
    .filter((vote): vote is Vote => vote !== null)
}

export function demoReactions(seated: readonly string[]): Reaction[] {
  return seated.map(demoReaction)
}

const DEMO_CREATED_AT = '2026-08-07T10:00:00.000Z'

/** A complete, playable session — the whole recording end to end. */
export const DEMO_AUDIENCE: Audience = {
  id: 'demo-audience',
  question: DEMO_QUESTION,
  seated: [...DEMO_SEATED],
  stage: 'aftermath',
  petitions: demoPetitions(DEMO_SEATED),
  deliberation: demoDeliberation(DEMO_SEATED),
  votes: demoVotes(DEMO_SEATED),
  decree: {
    text: DEMO_DECREE_TEXT,
    sidedWithId: 'wren',
    issuedAt: '2026-08-07T10:04:00.000Z',
  },
  reactions: demoReactions(DEMO_SEATED),
  createdAt: DEMO_CREATED_AT,
}
