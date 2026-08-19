import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourtErrorBoundary } from './CourtErrorBoundary'

function Boom(): never {
  throw new Error('xyzzy-raw-stack-detail')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CourtErrorBoundary (T-25)', () => {
  it('renders its children when nothing throws', () => {
    render(
      <CourtErrorBoundary>
        <p>the court is in session</p>
      </CourtErrorBoundary>,
    )
    expect(screen.getByText('the court is in session')).toBeInTheDocument()
  })

  it('catches an unexpected error and shows in-world copy, not a stack trace', () => {
    // The boundary logs the real error for the developer — silence it in the test.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <CourtErrorBoundary>
        <Boom />
      </CourtErrorBoundary>,
    )

    expect(
      screen.getByRole('heading', { name: /the court has stumbled/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /return to the throne/i }),
    ).toBeInTheDocument()
    // The raw error message never reaches the screen.
    expect(screen.queryByText(/xyzzy-raw-stack-detail/i)).toBeNull()
  })
})
