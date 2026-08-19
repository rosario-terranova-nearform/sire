import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * T-25 — the outermost net. §7.1 already keeps handled model failures off the
 * screen; this catches the ones nobody expected — a render that throws, a
 * malformed persisted shape that slips a schema — and dresses them in-world
 * instead of a white screen and a stack trace. The details go to the console
 * for the local developer; the monarch sees only that the court stumbled and a
 * way back to the throne.
 */
interface CourtErrorBoundaryProps {
  children: ReactNode
}

interface CourtErrorBoundaryState {
  hasError: boolean
}

export class CourtErrorBoundary extends Component<
  CourtErrorBoundaryProps,
  CourtErrorBoundaryState
> {
  state: CourtErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): CourtErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never shown to the user — a breadcrumb for whoever is running the app.
    console.error('[court] an unexpected error reached the boundary', error, info)
  }

  private reset = () => {
    // A full reload is the surest way back to a clean tree from an unknown fault.
    if (typeof window !== 'undefined') window.location.assign('/')
    else this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="font-heading text-3xl">The court has stumbled</h1>
          <p className="text-sm text-muted-foreground">
            Something unforeseen unseated the council mid-session. No harm is
            done — return to the throne and hold a fresh audience.
          </p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="border-4 border-ink bg-secondary px-4 py-2 font-heading text-secondary-foreground hover:bg-accent focus:outline-none focus:ring-4 focus:ring-gold"
        >
          Return to the throne
        </button>
      </main>
    )
  }
}
