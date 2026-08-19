import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the throne room at the root route', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'SIRE' }),
    ).toBeInTheDocument()
    // The front door to the whole flow (T-26): the audience CTA is present.
    expect(
      screen.getByRole('link', { name: /hold an audience/i }),
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
