import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DeliberationStage } from './DeliberationStage'
import type { Exchange } from '@/domain/audience'

const TURNS: Exchange[] = [
  { counselorId: 'vane', targetId: 'marrow', text: 'Coin is cowardly.', order: 0 },
  { counselorId: 'marrow', targetId: 'vane', text: 'Glory does not balance.', order: 1 },
  { counselorId: 'wren', targetId: 'vane', text: 'You missed the second daughter.', order: 2 },
]

describe('DeliberationStage (T-18)', () => {
  it('renders turns in order with a rebuttal arrow to the target', () => {
    render(<DeliberationStage turns={TURNS} activeSpeaker={null} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)

    // First turn: Vane rebuts Marrow, and the arrow is labelled for a11y.
    expect(within(items[0]).getByText('Lord Marshal Vane')).toBeInTheDocument()
    expect(within(items[0]).getByLabelText(/rebuts Keeper Marrow/i)).toBeInTheDocument()
    expect(within(items[0]).getByText('Coin is cowardly.')).toBeInTheDocument()

    // Wren lands last, as the engine ordered her.
    expect(within(items[2]).getByText('Wren')).toBeInTheDocument()
  })

  it('shows the live speaker streaming below the settled log', () => {
    render(
      <DeliberationStage
        turns={TURNS.slice(0, 1)}
        activeSpeaker={{ counselorId: 'grin', text: 'Buy peace with a girl', attempt: 1 }}
      />,
    )

    const live = screen.getByText(/takes the floor/i).closest('li')
    expect(live).not.toBeNull()
    expect(within(live!).getByText(/Buy peace with a girl/)).toBeInTheDocument()
  })
})
