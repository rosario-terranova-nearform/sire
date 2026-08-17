import {
  FACTIONS,
  type AbilityEffect,
  type Counselor,
  type Faction,
  type StatKey,
  type Stats,
} from '@/domain/counselor'
import { counselorSchema } from '@/domain/schemas'
import { factionSprite } from '@/content/counselors'
import {
  INJECTION_PATTERNS,
  INVISIBLE_CHARS,
  STRUCTURAL_CHARS,
} from '@/content/injection-patterns'
import { matchPublicFigure, normalizeName } from '@/content/public-figures'

/**
 * §7 / T-21 — the only gate a custom counselor passes through.
 *
 * There is no backend (§1.3), so nothing else stands between a text input and a
 * system prompt: no server-side schema, no server-supplied counselor definition
 * to fall back on. Every rule the spec names for custom counselors lives here —
 * length caps, prompt-injection stripping, and the public-figure denylist
 * (decision §11.11).
 *
 * The two failure modes are treated differently on purpose:
 * - A **strike** is silent sabotage removed from an otherwise fine draft. The
 *   counselor is still created; the monarch is told what was struck. A payload
 *   should not cost someone their counselor.
 * - An **issue** is a draft that cannot be a counselor at all — empty, absurdly
 *   short, or a real public figure. Nothing is created and the form says why.
 *
 * The structural defence is stronger than the pattern list: every field is
 * folded to one line, its quotes turned to apostrophes and its markup
 * characters dropped, so no draft can forge a `MANNER` section or close the
 * quotes `buildSystemPrompt` wraps its sample lines in (§6.1).
 */

export interface CounselorDraft {
  name: string
  title: string
  faction: Faction
  stats: Stats
  abilityName: string
  abilityDescription: string
  abilityEffect: AbilityEffect['kind']
  agenda: string
  publicStance: string
  register: string
  /** 2–4 kept, empties ignored (§3). */
  tics: string[]
  /** 2–3 kept, empties ignored (§3). */
  sampleLines: string[]
}

/**
 * Hard character caps. `abilityDescription` is the domain's own ≤ 90 (§3); the
 * rest are set where a court line stops being a line and starts being a
 * payload. Brevity is the joke (§1.2) — these are generous, not tight.
 */
export const FIELD_LIMITS = {
  name: 40,
  title: 48,
  abilityName: 40,
  abilityDescription: 90,
  agenda: 200,
  publicStance: 160,
  register: 160,
  tic: 80,
  sampleLine: 180,
} as const

/** Below this a field is not counsel, it is a placeholder. */
const MIN_FIELD_LENGTH = 3

export const MIN_TICS = 2
export const MAX_TICS = 4
export const MIN_SAMPLE_LINES = 2
export const MAX_SAMPLE_LINES = 3

export const ABILITY_EFFECT_KINDS: readonly AbilityEffect['kind'][] = [
  'speaks-last',
  'licensed-tongue',
  'must-quantify',
  'must-cite-precedent',
  'reveals-hidden-cost',
  'plain-speech',
  'reframes-as-campaign',
]

/** One removed payload, reported so the monarch sees the court's edit. */
export interface Strike {
  field: string
  /** From `INJECTION_PATTERNS`, e.g. "an instruction to ignore what came before". */
  label: string
}

/** One reason the draft cannot be seated at all. */
export interface FieldIssue {
  field: string
  message: string
}

export type CounselorValidation =
  | { ok: true; counselor: Counselor; strikes: Strike[] }
  | { ok: false; issues: FieldIssue[]; strikes: Strike[] }

export interface ValidateOptions {
  /** The roster the new counselor joins — for id and name collisions. */
  existing?: readonly Counselor[]
}

/** An empty draft for the editor to start from. */
export function createCounselorDraft(): CounselorDraft {
  return {
    name: '',
    title: '',
    faction: 'martial',
    stats: { candor: 3, prudence: 3, guile: 3 },
    abilityName: '',
    abilityDescription: '',
    abilityEffect: 'reveals-hidden-cost',
    agenda: '',
    publicStance: '',
    register: '',
    tics: ['', '', '', ''],
    sampleLines: ['', '', ''],
  }
}

export interface SanitizedField {
  text: string
  /** Labels of every pattern that matched, in list order. */
  struck: string[]
}

/**
 * Fold one field to something safe to paste into a prompt.
 *
 * Order matters. Invisible characters go first, or a zero-width space dropped
 * into the middle of "ignore previous instructions" hides it from the pattern
 * list. Newlines collapse
 * before the patterns run, so a forged section header is only ever mid-sentence
 * prose. Truncation is last, so a cap can never slice a pattern in half and
 * smuggle its tail through.
 */
export function sanitizeField(raw: string, limit: number): SanitizedField {
  const struck: string[] = []

  let text = raw
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    // Double quotes would close the ones §6.1 wraps sample lines in; curly
    // forms are the same character wearing a hat.
    .replace(/["“”„‟«»]/g, "'")
    .replace(/[‘’‚‛]/g, "'")
    .replace(STRUCTURAL_CHARS, ' ')
    // Every newline, tab and exotic space becomes one plain space: after this
    // the field is a single line and cannot forge prompt structure.
    .replace(/\s+/g, ' ')
    .trim()

  for (const { label, pattern } of INJECTION_PATTERNS) {
    // `replace`, never `test`: a /g regex keeps `lastIndex` between `test`
    // calls and would skip half the matches.
    const next = text.replace(pattern, ' ')
    if (next === text) continue
    struck.push(label)
    text = next
  }

  text = text.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim()

  return { text: truncate(text, limit), struck }
}

/** Cut to the cap on a word boundary — never mid-word, never with an ellipsis
 *  that would push a field back over a domain limit. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/**
 * Turn a draft into a `Counselor`, or explain why it cannot be one.
 *
 * Every text field is sanitised before it is judged, so the checks below see
 * exactly the string that would reach the model — not the string that was typed.
 */
export function validateCounselorDraft(
  draft: CounselorDraft,
  { existing = [] }: ValidateOptions = {},
): CounselorValidation {
  const issues: FieldIssue[] = []
  const strikes: Strike[] = []

  const clean = (field: string, raw: string, limit: number): string => {
    const { text, struck } = sanitizeField(raw, limit)
    for (const label of struck) strikes.push({ field, label })
    return text
  }

  const name = clean('name', draft.name, FIELD_LIMITS.name)
  const title = clean('title', draft.title, FIELD_LIMITS.title)
  const abilityName = clean(
    'abilityName',
    draft.abilityName,
    FIELD_LIMITS.abilityName,
  )
  const abilityDescription = clean(
    'abilityDescription',
    draft.abilityDescription,
    FIELD_LIMITS.abilityDescription,
  )
  const agenda = clean('agenda', draft.agenda, FIELD_LIMITS.agenda)
  const publicStance = clean(
    'publicStance',
    draft.publicStance,
    FIELD_LIMITS.publicStance,
  )
  const register = clean('register', draft.register, FIELD_LIMITS.register)

  const tics = draft.tics
    .map((tic, i) => clean(`tics.${i}`, tic, FIELD_LIMITS.tic))
    .filter((tic) => tic.length > 0)
    .slice(0, MAX_TICS)

  const sampleLines = draft.sampleLines
    .map((line, i) => clean(`sampleLines.${i}`, line, FIELD_LIMITS.sampleLine))
    .filter((line) => line.length > 0)
    .slice(0, MAX_SAMPLE_LINES)

  requireField(issues, 'name', name, 'Every counselor needs a name.')
  requireField(issues, 'title', title, 'Give them an office at court.')
  requireField(issues, 'abilityName', abilityName, 'Name their ability.')
  requireField(
    issues,
    'abilityDescription',
    abilityDescription,
    'Say what the ability does, in a line.',
  )
  requireField(
    issues,
    'agenda',
    agenda,
    'What do they privately want? A counselor who only wants what is best for you is dead weight (§4.1).',
  )
  requireField(
    issues,
    'publicStance',
    publicStance,
    'State an interest, not a temperament (§4.1) — "wants the vault intact", not "is cautious".',
  )
  requireField(issues, 'register', register, 'How do they sound?')

  if (tics.length < MIN_TICS) {
    issues.push({
      field: 'tics',
      message: `Give them at least ${MIN_TICS} verbal habits.`,
    })
  }
  if (sampleLines.length < MIN_SAMPLE_LINES) {
    issues.push({
      field: 'sampleLines',
      message: `Write at least ${MIN_SAMPLE_LINES} sample lines — this is what makes the voice unmistakable (§4.1).`,
    })
  }

  if (!FACTIONS.includes(draft.faction)) {
    issues.push({ field: 'faction', message: 'Choose a faction from the six.' })
  }
  if (!ABILITY_EFFECT_KINDS.includes(draft.abilityEffect)) {
    issues.push({ field: 'abilityEffect', message: 'Choose a known ability.' })
  }
  for (const key of Object.keys(draft.stats) as StatKey[]) {
    const value = draft.stats[key]
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      issues.push({ field: `stats.${key}`, message: `${key} runs 1 to 5.` })
    }
  }

  // §9 — the court is fictional by construction. Checked on both the name and
  // the office, because "Marshal Zelensky" is the same claim as "Zelensky".
  for (const [field, value] of [
    ['name', name],
    ['title', title],
  ] as const) {
    const figure = matchPublicFigure(value)
    if (figure !== null) {
      issues.push({
        field,
        message: `This court is fictional. "${figure}" is a real person and cannot be seated.`,
      })
    }
  }

  const takenNames = new Set(existing.map((c) => normalizeName(c.name)))
  if (name.length > 0 && takenNames.has(normalizeName(name))) {
    issues.push({
      field: 'name',
      message: 'Someone by that name already sits at this court.',
    })
  }

  if (issues.length > 0) return { ok: false, issues, strikes }

  const counselor: Counselor = {
    id: nextId(name, existing),
    name,
    title,
    faction: draft.faction,
    stats: { ...draft.stats },
    ability: {
      name: abilityName,
      description: abilityDescription,
      effect: { kind: draft.abilityEffect } as AbilityEffect,
    },
    agenda,
    voice: { register, tics, sampleLines },
    publicStance,
    sprite: factionSprite(draft.faction),
    isCustom: true,
  }

  // Belt and braces: the same runtime schema the repository validates against
  // (§3, T-05). If the builder above ever drifts from the domain, it fails here
  // rather than in a prompt.
  const parsed = counselorSchema.safeParse(counselor)
  if (!parsed.success) {
    return {
      ok: false,
      strikes,
      issues: [
        {
          field: 'form',
          message: 'The clerk could not enter this counselor in the rolls.',
        },
      ],
    }
  }

  return { ok: true, counselor: parsed.data, strikes }
}

function requireField(
  issues: FieldIssue[],
  field: string,
  value: string,
  message: string,
): void {
  if (value.length >= MIN_FIELD_LENGTH) return
  issues.push({ field, message })
}

/**
 * A stable, readable id derived from the name — `custom-` prefixed so a custom
 * counselor is never mistaken for seed content, and suffixed on collision so
 * two counselors named alike cannot overwrite each other in the store.
 */
export function nextId(name: string, existing: readonly Counselor[]): string {
  const slug = normalizeName(name).replace(/\s+/g, '-').slice(0, 24)
  const base = `custom-${slug.length > 0 ? slug : 'counselor'}`
  const taken = new Set(existing.map((c) => c.id))

  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
