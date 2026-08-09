import type { ModelMessage } from 'ai'
import type { Audience } from '@/domain/audience'
import type {
  AbilityEffect,
  Counselor,
  CounselorRoster,
} from '@/domain/counselor'
import { MAX_HISTORY, type Reign } from '@/domain/reign'
import { BANNED_PHRASES } from './validate-exchange'

/**
 * Prompt architecture (§6): pure functions, no template strings scattered
 * through call sites. Every builder is `(…) => ModelMessage[]` and does no I/O,
 * so the whole persona layer is snapshot-testable.
 *
 * The single most important property here is the **anchoring firewall** (§5.3):
 * `buildPetitionMessages` must not contain one word of another counselor's
 * text — not their petition, not their stance, not their name.
 */

export interface DeliberationRetry {
  /** The turn that was thrown out. */
  rejectedText: string
  /** Prompt-facing reasons, from `violationReasons()`. */
  reasons: readonly string[]
}

export interface DeliberationOptions {
  /** T-11: the one-shot stricter reminder after a failed turn (§5.4). */
  retry?: DeliberationRetry
}

/** §6.2 — the mechanical hook, turned into an instruction. */
export function abilityInstruction(effect: AbilityEffect): string | null {
  switch (effect.kind) {
    case 'must-quantify':
      return 'Every claim must carry a number — coin, months, heads, bushels. Invent plausible figures.'
    case 'plain-speech':
      return 'Never use an abstract noun. Use only things you can touch, eat, or bury.'
    case 'reveals-hidden-cost':
      return 'Name one consequence nobody else has mentioned. Never state how you know.'
    case 'reframes-as-campaign':
      return 'Treat the matter as a war to be won. Propose the aggressive option.'
    case 'must-cite-precedent':
      return 'Cite what happened to a previous ruler who tried this. Invent the reign.'
    case 'licensed-tongue':
      // §9: the fool's license covers the monarch's reasoning, never their
      // person. This boundary is not negotiable and not funny.
      return [
        'Say the thing the others are avoiding. Mock the monarch if the monarch is wrong.',
        "Mock the ruling and the reasoning only — never the monarch's body, worth, or who they are.",
      ].join('\n')
    case 'speaks-last':
      // Engine-level (§6.2): the effect is the turn order, not a instruction.
      return null
  }
}

/** §6.1 — the system prompt skeleton, identical across every stage. */
export function buildSystemPrompt(counselor: Counselor, reign: Reign): string {
  const { name, title, voice, ability, publicStance, agenda } = counselor

  const sections: string[] = [
    [
      'IDENTITY',
      `You are ${name}, ${title}, seated at the council of ${reign.monarchName}.`,
    ].join('\n'),
    [
      'INTEREST',
      `${publicStance} Privately: ${agenda} You never state the private part outright.`,
    ].join('\n'),
    [
      'VOICE',
      voice.register,
      `Habits: ${voice.tics.join('; ')}`,
      'You sound like this:',
      ...voice.sampleLines.map((line) => `  "${line}"`),
    ].join('\n'),
    [
      'MANNER',
      '- Speak to the monarch as "sire" / "your grace". Never modern register.',
      '- 2 to 4 sentences. Never more. Brevity is the point.',
      '- Never explain your own reasoning process. Assert, then justify in one clause.',
      '- Never break character. Never mention being a model, an AI, or a system.',
      '- You are not helpful. You are self-interested and you are giving counsel.',
    ].join('\n'),
  ]

  const instruction = abilityInstruction(ability.effect)
  if (instruction !== null) {
    sections.push([`ABILITY — ${ability.name}`, instruction].join('\n'))
  }

  const memory = renderMemory(reign)
  if (memory !== null) sections.push(memory)

  return sections.join('\n\n')
}

/**
 * §5.3 — one request per counselor, in parallel, each blind to the others.
 * Nothing about another counselor may appear in these messages.
 */
export function buildPetitionMessages(
  counselor: Counselor,
  audience: Audience,
  reign: Reign,
): ModelMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(counselor, reign) },
    {
      role: 'user',
      content: [
        renderMatter(audience),
        '',
        'The chamber is silent. You have heard no one else and you will not hear them before you speak — this is your petition, not a reply.',
        '',
        'Tell the monarch what should be done, and what it costs. 2 to 4 sentences.',
      ].join('\n'),
    },
  ]
}

/**
 * §5.4 — sequential and adversarial. The counselor gets the question, every
 * petition, the floor so far, and every rival's `publicStance` so they can
 * attack an interest rather than a personality.
 */
export function buildDeliberationMessages(
  counselor: Counselor,
  audience: Audience,
  reign: Reign,
  roster: CounselorRoster,
  { retry }: DeliberationOptions = {},
): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: [buildSystemPrompt(counselor, reign), floorContract()].join(
        '\n\n',
      ),
    },
    {
      role: 'user',
      content: [
        renderMatter(audience),
        '',
        renderTable(audience, roster, counselor.id),
        '',
        renderPetitions(audience, roster, counselor.id),
        '',
        renderFloor(audience, roster),
        '',
        'Dispute one of them now, by name. 2 to 4 sentences.',
      ].join('\n'),
    },
  ]

  if (retry !== undefined) {
    messages.push(
      { role: 'assistant', content: retry.rejectedText },
      {
        role: 'user',
        content: [
          'That will not do.',
          ...retry.reasons.map((reason) => `- ${reason}`),
          '',
          'Speak again. Name one other counselor at this table and dispute them by name. Do not repeat the words you just used.',
        ].join('\n'),
      },
    )
  }

  return messages
}

/**
 * §5.5 — one call returns the whole tally. The clerk is not a counselor: this
 * is the only prompt in the app with no persona and no license to invent.
 */
export function buildVoteMessages(
  audience: Audience,
  reign: Reign,
  roster: CounselorRoster,
): ModelMessage[] {
  const ids = seatedIds(audience, roster)

  return [
    {
      role: 'system',
      content: [
        `You are the clerk of the council of ${reign.monarchName}. You give no counsel. You record what the council does.`,
        '',
        'RULES',
        '- Each counselor backs the petition of exactly ONE other counselor.',
        '- No counselor may vote for themselves. Such a vote does not exist.',
        '- Use the ids exactly as given. Never invent an id and never rename one.',
        "- Counselors vote their own interest — not the monarch's, and not the wisest course. A counselor who was insulted on the floor remembers it.",
        "- Each rationale is at most 20 words, in that counselor's own idiom, never in yours.",
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        renderMatter(audience),
        '',
        renderCouncil(audience, roster),
        '',
        renderPetitions(audience, roster),
        '',
        renderFloor(audience, roster),
        '',
        `Record one vote for each of these ids, and no others: ${ids.join(', ')}.`,
      ].join('\n'),
    },
  ]
}

/** §5.7 — one call returns a reaction per counselor to the monarch's decree. */
export function buildAftermathMessages(
  audience: Audience,
  reign: Reign,
  roster: CounselorRoster,
): ModelMessage[] {
  const ids = seatedIds(audience, roster)

  return [
    {
      role: 'system',
      content: [
        `You are the clerk of the council of ${reign.monarchName}. The monarch has ruled. Record how the chamber takes it.`,
        '',
        'RULES',
        '- One entry for each counselor id given, and no others.',
        '- mood is exactly one of: neutral, pleased, appalled, scheming.',
        "- line is at most 15 words, spoken to the monarch, in that counselor's own voice.",
        "- favorDelta is a whole number from -2 to 2: how far the decree moved that counselor's regard for the monarch. Their INTEREST moves it, not their manners — a counselor who was overruled may still be pleased if the ruling serves them.",
        '- A counselor whose interest was ignored should show it.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        renderMatter(audience),
        '',
        renderCouncil(audience, roster),
        '',
        renderPetitions(audience, roster),
        '',
        renderFloor(audience, roster),
        '',
        renderDecree(audience, roster),
        '',
        `Record the chamber's reaction for each of these ids, and no others: ${ids.join(', ')}.`,
      ].join('\n'),
    },
  ]
}

/* ------------------------------------------------------------------ pieces */

function floorContract(): string {
  return [
    'THE FLOOR',
    'The petitions are read. Now you argue, and you are not here to be agreeable.',
    '- Name exactly one other counselor, by name, and dispute them.',
    '- You may not concede to anyone without naming a concrete cost of conceding.',
    `- Never write any of these: ${BANNED_PHRASES.map((phrase) => `"${phrase}"`).join(', ')}.`,
    '- Their interests are not yours. Say what theirs costs you, or costs the monarch.',
    '- Still 2 to 4 sentences. Still your own voice.',
  ].join('\n')
}

/** The counselor ids actually present in the roster, in seating order. */
function seatedIds(audience: Audience, roster: CounselorRoster): string[] {
  return audience.seated.filter((id) => roster[id] !== undefined)
}

function renderMatter(audience: Audience): string {
  return ['THE MATTER BEFORE THE COURT', `"${audience.question}"`].join('\n')
}

/** §3 — the last decrees, carried as memory into later prompts. */
function renderMemory(reign: Reign): string | null {
  const recent = reign.history.slice(-MAX_HISTORY)
  if (recent.length === 0) return null

  return [
    'WHAT THIS COURT REMEMBERS',
    ...recent.map(
      (entry) =>
        `- Asked: "${entry.question}" — the monarch decreed: "${entry.decree}"`,
    ),
  ].join('\n')
}

/** §5.4 — every rival's interest, so a counselor can attack the interest. */
function renderTable(
  audience: Audience,
  roster: CounselorRoster,
  selfId: string,
): string {
  const rivals = seatedIds(audience, roster)
    .filter((id) => id !== selfId)
    .map((id) => {
      const rival = roster[id]
      return `- ${rival.name}, ${rival.title} — ${rival.publicStance}`
    })

  return ['AT THE TABLE', ...rivals].join('\n')
}

function renderPetitions(
  audience: Audience,
  roster: CounselorRoster,
  selfId?: string,
): string {
  const lines = seatedIds(audience, roster).flatMap((id) => {
    const petition = audience.petitions.find(
      (entry) => entry.counselorId === id,
    )
    if (petition === undefined || petition.text.trim().length === 0) return []

    const speaker = id === selfId ? 'You said' : `${roster[id].name} said`
    return [`${speaker}: "${petition.text.trim()}"`]
  })

  if (lines.length === 0) {
    return ['PETITIONS LAID BEFORE THE MONARCH', 'None recorded.'].join('\n')
  }

  return ['PETITIONS LAID BEFORE THE MONARCH', ...lines].join('\n')
}

function renderFloor(audience: Audience, roster: CounselorRoster): string {
  const lines = [...audience.deliberation]
    .sort((a, b) => a.order - b.order)
    .flatMap((exchange) => {
      const speaker = roster[exchange.counselorId]
      const target = roster[exchange.targetId]
      if (speaker === undefined) return []

      const against = target === undefined ? '' : `, against ${target.name}`
      return [`${speaker.name}${against}: "${exchange.text.trim()}"`]
    })

  if (lines.length === 0) {
    return ['THE FLOOR SO FAR', 'Nothing yet. You open it.'].join('\n')
  }

  return ['THE FLOOR SO FAR', ...lines].join('\n')
}

/** The roster block the clerk needs: id, office, interest, and a voice sample. */
function renderCouncil(audience: Audience, roster: CounselorRoster): string {
  const entries = seatedIds(audience, roster).flatMap((id) => {
    const counselor = roster[id]
    const sample = counselor.voice.sampleLines[0]

    return [
      `- id: ${id} — ${counselor.name}, ${counselor.title}. ${counselor.publicStance}`,
      `  Speaks like this: ${counselor.voice.register}`,
      ...(sample === undefined ? [] : [`  For example: "${sample}"`]),
    ]
  })

  return ['THE COUNCIL', ...entries].join('\n')
}

function renderDecree(audience: Audience, roster: CounselorRoster): string {
  const decree = audience.decree
  if (decree === undefined) {
    return ['THE DECREE', 'The monarch has not ruled.'].join('\n')
  }

  const sidedWith =
    decree.sidedWithId === undefined ? undefined : roster[decree.sidedWithId]

  return [
    'THE DECREE',
    `The monarch ruled: "${decree.text.trim()}"`,
    ...(sidedWith === undefined
      ? []
      : [`The monarch says they sided with ${sidedWith.name}.`]),
  ].join('\n')
}
