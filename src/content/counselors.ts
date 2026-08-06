import type { Counselor, SpriteState } from '@/domain/counselor'

/** Placeholder sheets (T-04) put the four frames in this order. */
const FRAMES: Record<SpriteState, number> = {
  neutral: 0,
  pleased: 1,
  appalled: 2,
  scheming: 3,
}

const sprite = (id: string) => ({ sheet: `/sprites/${id}.png`, frames: FRAMES })

/**
 * The v1 council (§4). Authoring rules (§4.1):
 * - `publicStance` states an interest, never a temperament.
 * - No two counselors share a faction, so a legal seating can never
 *   accidentally stack the same interest twice.
 * - `sampleLines` must be mutually unmistakable — if two counselors' lines
 *   could be swapped without notice, the roster is broken.
 * - Every agenda can conflict with the monarch's own interest.
 */
export const COUNSELORS: readonly Counselor[] = [
  {
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
    agenda:
      'Glory, and a larger host — his name on the campaign, whatever the campaign turns out to be.',
    voice: {
      register:
        'clipped military imperatives; short declaratives, no hedging, no subordinate clauses',
      tics: [
        'counts in banners, seasons and marching days',
        "calls hesitation 'rot'",
        "drops 'sire' mid-sentence, the way an officer drops a rank",
      ],
      sampleLines: [
        'Strike in spring, sire, or explain to the widows why you waited for better weather.',
        'Every day this court deliberates is a day the other side spends digging.',
        'Give me nine banners and the matter is closed by harvest.',
      ],
    },
    publicStance:
      'Wants the host enlarged and committed before the campaigning season turns.',
    sprite: sprite('vane'),
    isCustom: false,
  },
  {
    id: 'marrow',
    name: 'Keeper Marrow',
    title: 'Mistress of Coin',
    faction: 'coin',
    stats: { candor: 2, prudence: 5, guile: 3 },
    ability: {
      name: 'The ledger speaks',
      description: 'Puts a price on everything, including the priceless.',
      effect: { kind: 'must-quantify' },
    },
    agenda:
      'A full vault, whatever the cost in glory — and two people at this table already owe her money.',
    voice: {
      register:
        'flat accountancy; every sentence lands on a figure, no adjectives worth paying for',
      tics: [
        'prices the unpriceable without blinking',
        "speaks of 'the ledger' as though it were a person in the room",
        'closes on a subtraction',
      ],
      sampleLines: [
        'Four thousand crowns, sire, and that is before the horses eat.',
        'Glory has never once balanced a column. I have checked, twice.',
        'Grant it and the winter salt tax rises a third. Say that part aloud.',
      ],
    },
    publicStance:
      'Wants the vault intact and the treasury solvent, whatever it costs the monarch in reputation.',
    sprite: sprite('marrow'),
    isCustom: false,
  },
  {
    id: 'grin',
    name: 'Grin',
    title: "The King's Fool",
    faction: 'fool',
    stats: { candor: 5, prudence: 1, guile: 4 },
    ability: {
      name: 'Licensed tongue',
      description: 'May say the unsayable; never silenced by lost favor.',
      effect: { kind: 'licensed-tongue' },
    },
    agenda:
      'To make you laugh, then flinch — and to remain the only one at court who can do both.',
    voice: {
      register:
        'rhyme, riddle and insult; very short lines that land like slaps',
      tics: [
        'rhymes hardest when the truth is worst',
        "says 'my king' with visible teeth",
        'answers a question with a worse question',
      ],
      sampleLines: [
        'A king who asks six men for courage has already voted, my king.',
        'Ha! Buy the sword. Then eat the scabbard, come winter.',
        'They all say yes so prettily. Ask them again with the door shut.',
      ],
    },
    publicStance:
      'Wants the thing nobody at this table will say out loud said out loud, today, by him.',
    sprite: sprite('grin'),
    isCustom: false,
  },
  {
    id: 'verity',
    name: 'Mother Verity',
    title: 'Voice of the Temple',
    faction: 'temple',
    stats: { candor: 3, prudence: 4, guile: 1 },
    ability: {
      // Judged by conscience via the reigns the temple remembers badly —
      // `must-cite-precedent` is the closest hook in the §3 effect union.
      name: 'Weight of sin',
      description: 'Judges by conscience, never by outcome.',
      effect: { kind: 'must-cite-precedent' },
    },
    agenda:
      "Your soul, and the temple's reach — a penitent king endows generously.",
    voice: {
      register:
        'scriptural cadence; speaks of sin and soul, never of cost or outcome',
      tics: [
        'names the sin outright, without softening it',
        'cites a ruler the temple remembers badly',
        'asks what the dead would say to it',
      ],
      sampleLines: [
        'Bishop-King Aldric walked this same road, sire, and the temple still will not say his name aloud.',
        'It is not whether it works. It is whether you can kneel afterwards.',
        'Call it prudence if you like. The ledger the temple keeps has another word.',
      ],
    },
    publicStance:
      "Wants the temple's judgement to be the verdict this court fears most.",
    sprite: sprite('verity'),
    isCustom: false,
  },
  {
    id: 'wren',
    name: 'Wren',
    title: 'Mistress of Whispers',
    faction: 'whispers',
    stats: { candor: 1, prudence: 4, guile: 5 },
    ability: {
      name: 'What I know',
      description: 'Always speaks last, and names a consequence others missed.',
      effect: { kind: 'speaks-last' },
    },
    agenda:
      'Leverage. She has a file on everyone in this chamber, you included.',
    voice: {
      register:
        'quiet and unhurried, all implication; opens on the consequence nobody else has named and never says how she knows it',
      tics: [
        'begins with what the room has overlooked',
        'never names a source',
        'leaves the last half of the sentence for the monarch to finish',
      ],
      sampleLines: [
        'They have all forgotten your cousin at Harrow, sire. He has not forgotten you.',
        'Do this and by autumn three men owe you nothing at all. I would count them first.',
        'The Marshal is right, which is unusual, and worth asking who told him.',
      ],
    },
    publicStance:
      'Wants every party at this table in her debt, the monarch included.',
    sprite: sprite('wren'),
    isCustom: false,
  },
  {
    id: 'hob',
    name: 'Old Hob',
    title: 'Of the Commons',
    faction: 'commons',
    stats: { candor: 4, prudence: 3, guile: 1 },
    ability: {
      name: 'Plain speech',
      description: 'The only one here who will live with your decree.',
      effect: { kind: 'plain-speech' },
    },
    agenda:
      'To survive the winter, and to keep his boy off the levy rolls one more year.',
    voice: {
      register:
        'plain farm speech; only things you can touch, eat or bury, never an abstract noun',
      tics: [
        'measures in winters, sacks of grain and funerals',
        'mentions who does the actual digging',
        'apologises for speaking, then speaks anyway',
      ],
      sampleLines: [
        "Begging pardon, sire, but it's my boy carries that spear, not yours.",
        "You can't eat a banner. We tried, the year the river froze.",
        'Two hundred sacks of seed corn, or two hundred graves come March. Same barn either way.',
      ],
    },
    publicStance:
      'Wants the commons to live through the winter that follows the decree.',
    sprite: sprite('hob'),
    isCustom: false,
  },
]

export const COUNSELORS_BY_ID: Readonly<Record<string, Counselor>> =
  Object.fromEntries(COUNSELORS.map((c) => [c.id, c]))

export function getCounselor(id: string): Counselor | undefined {
  return COUNSELORS_BY_ID[id]
}
