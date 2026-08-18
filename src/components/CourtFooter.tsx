/**
 * §9 / T-22 — the framing footer. A persistent, quiet line on every screen
 * that keeps the app honest about what it is: a court of fictional advisors,
 * not a source of advice. Mounted once by the root layout so it cannot be
 * forgotten on a screen, and deliberately understated — it frames, it does not
 * shout.
 */
export function CourtFooter() {
  return (
    <footer className="border-t-2 border-stone/40 bg-background px-6 py-4 text-center">
      <p className="text-xs text-muted-foreground">
        Counsel from a court of fictional advisors. Entertainment, not advice.
      </p>
    </footer>
  )
}
