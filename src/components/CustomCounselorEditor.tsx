import { useId, useState } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import { Input } from '@/components/ui/pixelact-ui/input'
import { CounselorCard } from '@/components/CounselorCard'
import { abilityInstruction } from '@/ai/prompt-builder'
import {
  FACTIONS,
  STAT_KEYS,
  type AbilityEffect,
  type Counselor,
  type Faction,
  type StatKey,
} from '@/domain/counselor'
import {
  ABILITY_EFFECT_KINDS,
  FIELD_LIMITS,
  MAX_SAMPLE_LINES,
  MAX_TICS,
  MIN_SAMPLE_LINES,
  MIN_TICS,
  createCounselorDraft,
  validateCounselorDraft,
  type CounselorDraft,
  type FieldIssue,
  type Strike,
} from '@/lib/validate-counselor'
import { cn } from '@/lib/utils'

/**
 * §7 / T-21 — the custom counselor editor: name, title, faction, stats, ability
 * picker, voice fields.
 *
 * Every field is a single-line input on purpose. `sanitizeField` collapses a
 * draft to one line anyway (a multi-line field is how you forge a prompt
 * section), so the form is honest about what it will keep rather than accepting
 * a paragraph and silently flattening it.
 *
 * The editor validates nothing itself. It hands the draft to
 * `validateCounselorDraft` — the one gate (§7) — and renders what comes back:
 * issues block the seat, strikes are reported as the court's edit and do not.
 */
export interface CustomCounselorEditorProps {
  /** The court the new counselor joins — for name and id collisions. */
  existing: readonly Counselor[]
  onSeat: (counselor: Counselor) => void
  onCancel?: () => void
}

const FACTION_BLURB: Record<Faction, string> = {
  martial: 'war, action, decisive force',
  coin: 'cost, budget, solvency',
  fool: 'truth via mockery',
  temple: 'conscience, principle',
  whispers: 'second-order consequences, politics',
  commons: 'who actually bears the cost',
}

const ABILITY_LABEL: Record<AbilityEffect['kind'], string> = {
  'speaks-last': 'Speaks last',
  'licensed-tongue': 'Licensed tongue',
  'must-quantify': 'Must quantify',
  'must-cite-precedent': 'Must cite precedent',
  'reveals-hidden-cost': 'Reveals a hidden cost',
  'plain-speech': 'Plain speech',
  'reframes-as-campaign': 'Reframes as a campaign',
}

/** What the picked effect actually does to the prompt (§6.2), shown plainly. */
function effectExplanation(kind: AbilityEffect['kind']): string {
  if (kind === 'speaks-last') {
    return 'Engine-level: this counselor is moved to the end of the floor, every time (§5.4).'
  }
  if (kind === 'licensed-tongue') {
    return 'Never silenced by lost favor (§5.7), and licensed to say what the table avoids.'
  }
  return abilityInstruction({ kind } as AbilityEffect) ?? ''
}

export function CustomCounselorEditor({
  existing,
  onSeat,
  onCancel,
}: CustomCounselorEditorProps) {
  const [draft, setDraft] = useState<CounselorDraft>(createCounselorDraft)
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const [strikes, setStrikes] = useState<Strike[]>([])
  const [preview, setPreview] = useState<Counselor | null>(null)

  const set = <K extends keyof CounselorDraft>(
    key: K,
    value: CounselorDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const setListItem = (
    key: 'tics' | 'sampleLines',
    index: number,
    value: string,
  ) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((entry, i) => (i === index ? value : entry)),
    }))

  function submit() {
    const result = validateCounselorDraft(draft, { existing })
    setStrikes(result.strikes)

    if (!result.ok) {
      setIssues(result.issues)
      setPreview(null)
      return
    }

    setIssues([])
    setPreview(result.counselor)
    onSeat(result.counselor)
    setDraft(createCounselorDraft())
  }

  const issueFor = (field: string) =>
    issues.find((issue) => issue.field === field)?.message

  return (
    <form
      aria-label="Invent a counselor"
      className="flex flex-col gap-8 border-4 border-ink bg-card p-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div>
        <h2 className="font-heading text-2xl">Invent a counselor</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          State an interest, not a temperament, and give them something they want
          that you do not. A counselor who only wants what is best for you is
          dead weight.
        </p>
      </div>

      <Field
        label="Name"
        hint="No real public figures — this court is fictional."
        limit={FIELD_LIMITS.name}
        value={draft.name}
        error={issueFor('name')}
        onChange={(value) => set('name', value)}
        placeholder="Keeper Ashvane"
      />

      <Field
        label="Office at court"
        limit={FIELD_LIMITS.title}
        value={draft.title}
        error={issueFor('title')}
        onChange={(value) => set('title', value)}
        placeholder="Warden of the Locks"
      />

      <FactionPicker
        value={draft.faction}
        error={issueFor('faction')}
        onChange={(faction) => set('faction', faction)}
      />

      <StatsPicker
        stats={draft.stats}
        onChange={(key, value) =>
          set('stats', { ...draft.stats, [key]: value })
        }
      />

      <fieldset className="flex flex-col gap-4 border-2 border-stone p-4">
        <legend className="px-2 font-heading text-lg">Ability</legend>

        <AbilityPicker
          value={draft.abilityEffect}
          error={issueFor('abilityEffect')}
          onChange={(kind) => set('abilityEffect', kind)}
        />

        <Field
          label="Ability name"
          limit={FIELD_LIMITS.abilityName}
          value={draft.abilityName}
          error={issueFor('abilityName')}
          onChange={(value) => set('abilityName', value)}
          placeholder="The long memory"
        />

        <Field
          label="Ability description"
          hint="Card copy — kept to 90 characters."
          limit={FIELD_LIMITS.abilityDescription}
          value={draft.abilityDescription}
          error={issueFor('abilityDescription')}
          onChange={(value) => set('abilityDescription', value)}
          placeholder="Remembers every promise the crown has broken."
        />
      </fieldset>

      <Field
        label="Public stance"
        hint="The interest the rest of the table can attack."
        limit={FIELD_LIMITS.publicStance}
        value={draft.publicStance}
        error={issueFor('publicStance')}
        onChange={(value) => set('publicStance', value)}
        placeholder="Wants the river tolls in her ledger before the thaw."
      />

      <Field
        label="Private agenda"
        hint="Hidden until you have heard them three times."
        limit={FIELD_LIMITS.agenda}
        value={draft.agenda}
        error={issueFor('agenda')}
        onChange={(value) => set('agenda', value)}
        placeholder="To buy the harbour quietly, in her brother's name."
      />

      <fieldset className="flex flex-col gap-4 border-2 border-stone p-4">
        <legend className="px-2 font-heading text-lg">Voice</legend>

        <Field
          label="Register"
          hint="How they sound, in one line."
          limit={FIELD_LIMITS.register}
          value={draft.register}
          error={issueFor('register')}
          onChange={(value) => set('register', value)}
          placeholder="dry, clerical, every sentence closing on a condition"
        />

        <div className="flex flex-col gap-2">
          <p className="font-heading text-base">
            Verbal habits{' '}
            <span className="font-sans text-xs text-muted-foreground">
              ({MIN_TICS}–{MAX_TICS})
            </span>
          </p>
          {draft.tics.map((tic, index) => (
            <Input
              key={index}
              value={tic}
              maxLength={FIELD_LIMITS.tic}
              aria-label={`Verbal habit ${index + 1}`}
              placeholder={index === 0 ? 'quotes the contract, never the man' : ''}
              onChange={(event) =>
                setListItem('tics', index, event.target.value)
              }
            />
          ))}
          <FieldError message={issueFor('tics')} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-heading text-base">
            Sample lines{' '}
            <span className="font-sans text-xs text-muted-foreground">
              ({MIN_SAMPLE_LINES}–{MAX_SAMPLE_LINES}) — this is what makes the
              voice unmistakable
            </span>
          </p>
          {draft.sampleLines.map((line, index) => (
            <Input
              key={index}
              value={line}
              maxLength={FIELD_LIMITS.sampleLine}
              aria-label={`Sample line ${index + 1}`}
              placeholder={
                index === 0
                  ? 'Sign it if you like, sire. I keep the copy that matters.'
                  : ''
              }
              onChange={(event) =>
                setListItem('sampleLines', index, event.target.value)
              }
            />
          ))}
          <FieldError message={issueFor('sampleLines')} />
        </div>
      </fieldset>

      {strikes.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-1 border-l-4 border-wax bg-background p-4"
        >
          <p className="font-heading text-base">
            The clerk struck {strikes.length}{' '}
            {strikes.length === 1 ? 'passage' : 'passages'} from your draft
          </p>
          <ul className="flex flex-col gap-1">
            {strikes.map((strike, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {strike.field}: {strike.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.some((issue) => issue.field === 'form') && (
        <FieldError message={issueFor('form')} />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit">Seat them</Button>
        {onCancel !== undefined && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Never mind
          </Button>
        )}
        {issues.length > 0 && (
          <span className="text-sm text-wax">
            {issues.length} {issues.length === 1 ? 'objection' : 'objections'}{' '}
            from the clerk.
          </span>
        )}
      </div>

      {preview !== null && (
        <div className="flex flex-col gap-3 border-t-4 border-ink pt-6">
          <p className="font-heading text-lg">
            {preview.name} is entered in the rolls.
          </p>
          <div className="max-w-sm">
            <CounselorCard counselor={preview} variant="full" agendaRevealed />
          </div>
        </div>
      )}
    </form>
  )
}

interface FieldProps {
  label: string
  hint?: string
  limit: number
  value: string
  error?: string
  placeholder?: string
  onChange: (value: string) => void
}

function Field({
  label,
  hint,
  limit,
  value,
  error,
  placeholder,
  onChange,
}: FieldProps) {
  const id = useId()
  const hintId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-heading text-base">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <Input
        id={id}
        value={value}
        maxLength={limit}
        placeholder={placeholder}
        aria-describedby={hint === undefined ? undefined : hintId}
        aria-invalid={error !== undefined || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="self-end text-xs tabular-nums text-muted-foreground">
        {value.length} / {limit}
      </p>
      <FieldError message={error} />
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (message === undefined) return null
  return (
    <p role="alert" className="text-sm text-wax">
      {message}
    </p>
  )
}

function FactionPicker({
  value,
  error,
  onChange,
}: {
  value: Faction
  error?: string
  onChange: (faction: Faction) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-heading text-base">Faction</legend>
      <p className="text-xs text-muted-foreground">
        No two seated counselors may share one, so a new faction is a new seat at
        every audience.
      </p>
      <div className="flex flex-wrap gap-2">
        {FACTIONS.map((faction) => (
          <button
            key={faction}
            type="button"
            aria-pressed={faction === value}
            onClick={() => onChange(faction)}
            className={cn(
              'border-2 px-3 py-1.5 text-left text-sm',
              'focus:outline-none focus:ring-2 focus:ring-gold',
              faction === value
                ? 'border-ink bg-gold text-ink'
                : 'border-stone bg-transparent text-foreground hover:border-gold',
            )}
          >
            <span className="font-heading">{faction}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {FACTION_BLURB[faction]}
            </span>
          </button>
        ))}
      </div>
      <FieldError message={error} />
    </fieldset>
  )
}

function StatsPicker({
  stats,
  onChange,
}: {
  stats: Record<StatKey, number>
  onChange: (key: StatKey, value: 1 | 2 | 3 | 4 | 5) => void
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-heading text-base">Stats</legend>
      <p className="text-xs text-muted-foreground">
        Pips on the card. Cosmetic — they never weight the prompt (§3).
      </p>
      {STAT_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
            {key}
          </span>
          <div
            role="radiogroup"
            aria-label={key}
            className="flex items-center gap-1"
          >
            {([1, 2, 3, 4, 5] as const).map((pip) => (
              <button
                key={pip}
                type="button"
                role="radio"
                aria-checked={stats[key] === pip}
                aria-label={`${key} ${pip}`}
                onClick={() => onChange(key, pip)}
                className={cn(
                  'size-5 border-2 border-ink focus:outline-none focus:ring-2 focus:ring-gold',
                  pip <= stats[key] ? 'bg-gold' : 'bg-transparent',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  )
}

function AbilityPicker({
  value,
  error,
  onChange,
}: {
  value: AbilityEffect['kind']
  error?: string
  onChange: (kind: AbilityEffect['kind']) => void
}) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-heading text-base">
        What the ability does
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) =>
          onChange(event.target.value as AbilityEffect['kind'])
        }
        className="border-4 border-ink bg-background p-2 font-sans text-base text-foreground focus:outline-none focus:ring-4 focus:ring-gold"
      >
        {ABILITY_EFFECT_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ABILITY_LABEL[kind]}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{effectExplanation(value)}</p>
      <FieldError message={error} />
    </div>
  )
}
