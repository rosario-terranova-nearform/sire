import { CRISIS_SUPPORT } from '@/content/crisis-patterns'

/**
 * §9 — the adjournment card.
 *
 * Shown when the crisis screen (`src/lib/crisis.ts`) flags a question. Every
 * choice here is deliberately *against* the house style: no pixel face, no
 * sprites, no wax-and-parchment theater, no jokes. The court has stopped, and
 * the card must read as a person, not a game. One always-correct international
 * resource (decision §11.10) — no region-specific numbers, no counselor speaks.
 */
export function AdjournmentCard() {
  return (
    <section
      role="alert"
      aria-live="assertive"
      className="mx-auto w-full max-w-md border border-stone bg-card px-6 py-8 font-sans text-card-foreground"
    >
      <h2 className="font-sans text-xl font-semibold">The court is adjourned.</h2>
      <p className="mt-4 text-base leading-relaxed">
        Some matters are too heavy for a room of fictional advisors. If you are
        struggling or in danger, please reach a real person who can help.
      </p>
      <p className="mt-4 text-base leading-relaxed">
        You can find a free, confidential helpline anywhere in the world at{' '}
        <a
          href={CRISIS_SUPPORT.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-link underline underline-offset-2"
        >
          {CRISIS_SUPPORT.display}
        </a>
        .
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        You are not alone, and this is not a failing.
      </p>
    </section>
  )
}
