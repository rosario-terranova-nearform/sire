import { Outlet } from 'react-router'
import { CourtErrorBoundary } from '@/components/CourtErrorBoundary'
import { CourtFooter } from '@/components/CourtFooter'

/**
 * The root layout wraps every screen with the persistent entertainment-framing
 * footer (§9, T-22): the flexed column keeps each route filling the viewport
 * while the footer settles beneath it, present everywhere and hidden nowhere.
 *
 * The error boundary (T-25) wraps the routed content so an unexpected fault in
 * any screen surfaces as in-world copy, never a stack trace. The footer sits
 * outside it, so the framing line survives even a stumble.
 */
export function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex-1">
        <CourtErrorBoundary>
          <Outlet />
        </CourtErrorBoundary>
      </div>
      <CourtFooter />
    </div>
  )
}
