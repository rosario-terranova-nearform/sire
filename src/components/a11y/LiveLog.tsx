/**
 * T-24 — a visually hidden, append-only announcement log.
 *
 * Streaming counselor text must reach a screen reader once per turn, not once
 * per token. The visible cards stream freely (no live region on them); this
 * off-screen `role="log"` region carries one finished line per completed
 * petition and per completed deliberation turn. `role="log"` announces only
 * newly added children and never re-reads the ones already there, so the
 * caller feeds it an append-only list and each turn is spoken exactly once.
 */
export interface LiveLogProps {
  /** Append-only, in arrival order. Never reorder or remove entries. */
  messages: readonly string[]
  /** Names the log for assistive tech, e.g. "Court transcript". */
  label: string
}

export function LiveLog({ messages, label }: LiveLogProps) {
  return (
    <div role="log" aria-live="polite" aria-label={label} className="sr-only">
      {messages.map((message, index) => (
        <p key={index}>{message}</p>
      ))}
    </div>
  )
}
