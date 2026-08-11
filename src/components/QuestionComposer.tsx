import { useId, useState } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import { EXAMPLE_QUESTIONS } from '@/content/example-questions'
import { MAX_QUESTION_LENGTH } from '@/domain/audience'
import { isValidQuestion } from '@/engine/audience-machine'
import { cn } from '@/lib/utils'

/**
 * §5.1 / §8 / T-15 — the question composer, step 1 of `/audience/new`.
 *
 * A parchment input with a live character counter (300-char cap, §5.1), a set
 * of clickable example prompts mixing absurd and real (decision §11.5), and a
 * single "seek counsel" submit. It owns nothing but the draft text: the crisis
 * screen (§9) and the machine transition to `seating` are the route's job, so
 * this component stays a pure input the route can drop anywhere.
 *
 * The field is body copy, so it is the legible sans face, never the bitmap
 * display face (§2.1) — a pixel font at input size is unreadable.
 */

export interface QuestionComposerProps {
  /** Seed text, e.g. when the monarch steps back to edit. */
  initialValue?: string
  /** Called with the trimmed question once the monarch submits a valid one. */
  onSubmit: (question: string) => void
  /** Disable the whole composer (e.g. while the court is adjourned). */
  disabled?: boolean
}

export function QuestionComposer({
  initialValue = '',
  onSubmit,
  disabled = false,
}: QuestionComposerProps) {
  const [question, setQuestion] = useState(initialValue)
  const fieldId = useId()
  const counterId = useId()

  const length = question.length
  const remaining = MAX_QUESTION_LENGTH - length
  const nearLimit = remaining <= 30
  const valid = isValidQuestion(question)

  function submit() {
    if (disabled || !valid) return
    onSubmit(question.trim())
  }

  return (
    <form
      className="flex w-full max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="font-heading text-lg">
          What troubles the crown?
        </label>
        <textarea
          id={fieldId}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter keeps its newline for a longer plea.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={disabled}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          aria-describedby={counterId}
          placeholder="Speak your question, sire…"
          // Parchment surface: thick ink border, wax focus ring, sans body face.
          className={cn(
            'w-full resize-none border-4 border-ink bg-card p-4 font-sans text-base text-card-foreground',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-4 focus:ring-gold',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        />
        <p
          id={counterId}
          aria-live="polite"
          className={cn(
            'self-end text-xs tabular-nums',
            nearLimit ? 'text-wax' : 'text-muted-foreground',
          )}
        >
          {length} / {MAX_QUESTION_LENGTH}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Or borrow a matter from another reign
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={disabled}
              onClick={() => setQuestion(example)}
              className={cn(
                'border-2 border-stone bg-transparent px-3 py-1.5 text-left text-sm text-foreground',
                'hover:border-gold hover:bg-card focus:outline-none focus:ring-2 focus:ring-gold',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={disabled || !valid}>
          Seek counsel
        </Button>
        {!valid && length === 0 && (
          <span className="text-sm text-muted-foreground">
            The council waits on your word.
          </span>
        )}
      </div>
    </form>
  )
}
