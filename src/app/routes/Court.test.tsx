import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Court } from './Court'
import { COUNSELORS } from '@/content/counselors'

function renderCourt() {
  const router = createMemoryRouter(
    [
      { path: '/court', Component: Court },
      { path: '/audience/new', Component: () => <p>SEATING</p> },
    ],
    { initialEntries: ['/court'] },
  )
  return render(<RouterProvider router={router} />)
}

function inventCounselor(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /invent a counselor/i }))

  const values: Record<string, string> = {
    Name: name,
    'Office at court': 'Warden of the Locks',
    'Ability name': 'The long memory',
    'Ability description': 'Remembers every promise the crown has broken.',
    'Public stance': 'Wants the river tolls in her ledger before the thaw.',
    'Private agenda': 'To buy the harbour quietly, in her own name.',
    Register: 'dry and clerical, every sentence closing on a condition',
    'Verbal habit 1': 'quotes the contract, never the man',
    'Verbal habit 2': 'counts in tolls and tides',
    'Sample line 1': 'Sign it if you like, sire. I keep the copy that matters.',
    'Sample line 2': 'The locks hold, or the tolls do not. Choose one.',
  }
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }

  fireEvent.click(screen.getByRole('button', { name: /seat them/i }))
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('Court (T-21)', () => {
  it('shows the whole seed roster', () => {
    renderCourt()
    for (const counselor of COUNSELORS) {
      expect(screen.getByText(counselor.name)).toBeInTheDocument()
    }
  })

  it('masks agendas until a counselor has been heard enough', () => {
    renderCourt()
    expect(screen.getAllByText('AGENDA: ???')).toHaveLength(COUNSELORS.length)
  })

  it('adds an invented counselor to the roster and keeps it across a remount', () => {
    const { unmount } = renderCourt()
    inventCounselor('Keeper Ashvane')

    // Twice on screen: the editor's confirmation card, and the roster entry.
    expect(screen.getAllByText('Keeper Ashvane').length).toBeGreaterThan(0)
    unmount()

    renderCourt()
    expect(screen.getByText('Keeper Ashvane')).toBeInTheDocument()
  })

  it('dismisses a custom counselor from the court', () => {
    renderCourt()
    inventCounselor('Keeper Ashvane')
    fireEvent.click(screen.getByRole('button', { name: /close the rolls/i }))

    fireEvent.click(screen.getByRole('button', { name: /dismiss from court/i }))
    expect(screen.queryByText('Keeper Ashvane')).not.toBeInTheDocument()
  })

  it('never offers to dismiss a seed counselor', () => {
    renderCourt()
    expect(
      screen.queryByRole('button', { name: /dismiss from court/i }),
    ).not.toBeInTheDocument()
  })
})
