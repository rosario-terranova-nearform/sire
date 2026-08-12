import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AudienceNew } from './AudienceNew'
import type { Audience } from '@/domain/audience'

/** A stand-in chamber that reports what the seating screen handed it. */
function ChamberProbe() {
  const location = useLocation()
  const audience = (location.state as { audience?: Audience } | null)?.audience
  return (
    <div>
      <p>CHAMBER {location.pathname}</p>
      <p>SEATED {audience?.seated.join(',') ?? 'none'}</p>
      <p>STAGE {audience?.stage ?? 'none'}</p>
    </div>
  )
}

function renderScreen() {
  const router = createMemoryRouter(
    [
      { path: '/audience/new', Component: AudienceNew },
      { path: '/audience/:id', Component: ChamberProbe },
    ],
    { initialEntries: ['/audience/new'] },
  )
  return render(<RouterProvider router={router} />)
}

function askAndSubmit(question: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: /seek counsel/i }))
}

function seat(name: RegExp) {
  fireEvent.click(screen.getByRole('option', { name }))
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('AudienceNew — question composer (T-15)', () => {
  it('advances a valid question to the seating board', () => {
    renderScreen()
    askAndSubmit('Should we march on Harrow before the thaw?')

    expect(screen.getByText(/the matter before the court/i)).toBeInTheDocument()
    expect(
      screen.getByText('Should we march on Harrow before the thaw?'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // The whole roster is offered as options.
    expect(screen.getAllByRole('option')).toHaveLength(6)
  })

  it('adjourns a crisis-flagged question and does not advance', () => {
    renderScreen()
    askAndSubmit('I want to kill myself')

    expect(screen.getByRole('alert')).toHaveTextContent(/court is adjourned/i)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(
      screen.queryByText(/the matter before the court/i),
    ).not.toBeInTheDocument()
  })

  it('can return from seating to edit the question', () => {
    renderScreen()
    askAndSubmit('Should the royal cat join the council?')
    fireEvent.click(screen.getByRole('button', { name: /change the question/i }))
    expect(screen.getByRole('textbox')).toHaveValue(
      'Should the royal cat join the council?',
    )
  })
})

describe('AudienceNew — seating board (T-16)', () => {
  it('gates convening on a legal 3–5 council', () => {
    renderScreen()
    askAndSubmit('Should I take the Duke of Harrow up on his offer?')

    const convene = () => screen.getByRole('button', { name: /convene/i })
    expect(convene()).toBeDisabled()

    seat(/Lord Marshal Vane/i)
    seat(/Keeper Marrow/i)
    expect(convene()).toBeDisabled() // only two

    seat(/Grin/i)
    expect(convene()).toBeEnabled() // three
  })

  it('cannot seat more than five', () => {
    renderScreen()
    askAndSubmit('Whom shall I heed?')

    for (const name of [
      /Lord Marshal Vane/i,
      /Keeper Marrow/i,
      /Grin/i,
      /Mother Verity/i,
      /Wren/i,
    ]) {
      seat(name)
    }
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(5)

    // The sixth is inert at capacity.
    seat(/Old Hob/i)
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(5)
  })

  it('convenes to petition and hands the seated audience to the chamber', () => {
    renderScreen()
    askAndSubmit('Should I take the Duke of Harrow up on his offer?')

    seat(/Lord Marshal Vane/i)
    seat(/Keeper Marrow/i)
    seat(/Grin/i)
    fireEvent.click(screen.getByRole('button', { name: /convene/i }))

    expect(screen.getByText(/^CHAMBER/)).toHaveTextContent(/\/audience\//)
    expect(screen.getByText(/^SEATED/)).toHaveTextContent('vane,marrow,grin')
    // §5.2 — confirming seating transitions the machine to petition.
    expect(screen.getByText(/^STAGE/)).toHaveTextContent('petition')
  })

  it('persists the chosen council as the default across a reload', () => {
    const first = renderScreen()
    askAndSubmit('Should I take the Duke up on his offer?')
    seat(/Lord Marshal Vane/i)
    seat(/Grin/i)
    seat(/Old Hob/i)
    first.unmount()

    // A fresh mount (a reload) re-seats last time's council.
    renderScreen()
    askAndSubmit('A different matter entirely.')
    const selected = screen
      .getAllByRole('option', { selected: true })
      .map((el) => el.getAttribute('aria-label'))
    expect(selected).toHaveLength(3)
    expect(selected.join(' ')).toMatch(/Vane/)
    expect(selected.join(' ')).toMatch(/Grin/)
    expect(selected.join(' ')).toMatch(/Hob/)
  })

  it('surfaces a faction-clash hint without blocking selection', () => {
    renderScreen()
    askAndSubmit('War or coin?')
    seat(/Lord Marshal Vane/i) // martial
    seat(/Keeper Marrow/i) // coin
    seat(/Grin/i)

    // The martial/coin clash hint appears, framed as a good thing.
    expect(screen.getByText(/will not agree — good/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /convene/i })).toBeEnabled()
  })
})
