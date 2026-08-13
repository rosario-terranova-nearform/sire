import { useState } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import { MAX_DECREE_LENGTH } from '@/domain/audience'
import type { CounselorRoster } from '@/domain/counselor'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { cn } from '@/lib/utils'

/**
 * §5.6 / §8.1 (5) / T-19 — the decree. Free text on parchment, capped at 400
 * chars with a live counter, an optional "I sided with…" note, and quick
 * rulings for low-effort sessions. Sealing with the wax stamp is the app's
 * ending — this, not the tally, is what gets kept and shared.
 */
export interface DecreeStageProps {
  seated: readonly string[]
  roster?: CounselorRoster
  /** Rule. `sidedWithId` is optional and always a seated counselor. */
  onIssue: (text: string, sidedWithId?: string) => void
  /** The ruling is in — lock the parchment. */
  disabled?: boolean
}

/** §5.6 — the one-tap rulings. */
const QUICK_DECREES = ['So be it.', 'Denied.', 'I will think on it.'] as const

export function DecreeStage({
  seated,
  roster = COUNSELORS_BY_ID,
  onIssue,
  disabled = false,
}: DecreeStageProps) {
  const [text, setText] = useState('')
  const [sidedWith, setSidedWith] = useState<string | undefined>(undefined)

  const trimmed = text.trim()
  const canSeal = trimmed.length > 0 && !disabled

  function seal() {
    if (!canSeal) return
    onIssue(trimmed, sidedWith)
  }

  return (
    <section aria-label="The decree" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl">Your decree</h2>
        <p className="text-sm italic text-muted-foreground">
          The ruling is yours, sire &mdash; not theirs.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="decree-text" className="sr-only">
          Your decree
        </label>
        <textarea
          id="decree-text"
          value={text}
          maxLength={MAX_DECREE_LENGTH}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="Speak your will…"
          className={cn(
            'w-full resize-y border-4 border-ink bg-card p-4 font-heading text-lg text-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold',
            'disabled:opacity-70',
          )}
        />
        <p className="self-end text-xs text-muted-foreground" aria-live="polite">
          {text.length} / {MAX_DECREE_LENGTH}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-xs uppercase tracking-wide text-muted-foreground">
          I sided with… (optional)
        </legend>
        <div className="flex flex-wrap gap-2">
          {seated.map((id) => {
            const counselor = roster[id]
            if (counselor === undefined) return null
            const chosen = sidedWith === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={chosen}
                onClick={() => setSidedWith(chosen ? undefined : id)}
                className={cn(
                  'border-2 border-ink px-3 py-1.5 text-sm transition-colors',
                  chosen
                    ? 'bg-gold text-ink'
                    : 'bg-card text-foreground hover:bg-accent',
                )}
              >
                {counselor.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t-2 border-stone pt-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_DECREES.map((quick) => (
            <Button
              key={quick}
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onIssue(quick, sidedWith)}
            >
              {quick}
            </Button>
          ))}
        </div>

        <Button
          variant="destructive"
          disabled={!canSeal}
          onClick={seal}
          className="w-fit"
        >
          🔴 Seal the decree
        </Button>
      </div>
    </section>
  )
}
