import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the throne room at the root route', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'The Throne Room' }),
    ).toBeInTheDocument()
  })

  // §9 / T-22 — the framing footer is app-wide, mounted by the root layout, so
  // it is present on the very first screen without any screen opting in.
  it('shows the persistent entertainment-framing footer', () => {
    render(<App />)
    expect(
      screen.getByText(
        'Counsel from a court of fictional advisors. Entertainment, not advice.',
      ),
    ).toBeInTheDocument()
  })
})
