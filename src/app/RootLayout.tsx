import { Outlet } from 'react-router'
import { CourtFooter } from '@/components/CourtFooter'

/**
 * The root layout wraps every screen with the persistent entertainment-framing
 * footer (§9, T-22): the flexed column keeps each route filling the viewport
 * while the footer settles beneath it, present everywhere and hidden nowhere.
 */
export function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <CourtFooter />
    </div>
  )
}
