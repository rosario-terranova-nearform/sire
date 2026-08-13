import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VoteStage } from './VoteStage'
import type { Vote } from '@/domain/audience'
import { tallyVotes } from '@/ai/sanitize'

const SEATED = ['vane', 'marrow', 'grin']

describe('VoteStage (T-19)', () => {
  it('frames the tally as the council preference, not the answer', () => {
    const votes: Vote[] = [
      { voterId: 'vane', forId: 'marrow', rationale: 'coin takes the ridge' },
      { voterId: 'grin', forId: 'marrow', rationale: 'the spider is right' },
      { voterId: 'marrow', forId: 'grin', rationale: 'the fool counts' },
    ]
    render(
      <VoteStage votes={votes} tally={tallyVotes(votes, SEATED)} seated={SEATED} />,
    )

    expect(
      screen.getByText(/the council.s preference, not the answer/i),
    ).toBeInTheDocument()
    // Marrow leads with two hands.
    expect(screen.getByText(/leans toward/i)).toHaveTextContent(/Keeper Marrow/)
  })

  it('shows a hung council with no winner declared', () => {
    // A perfect three-way cycle: nobody clears the top.
    const votes: Vote[] = [
      { voterId: 'vane', forId: 'marrow', rationale: 'x' },
      { voterId: 'marrow', forId: 'grin', rationale: 'y' },
      { voterId: 'grin', forId: 'vane', rationale: 'z' },
    ]
    const tally = tallyVotes(votes, SEATED)
    expect(tally.hung).toBe(true)

    render(<VoteStage votes={votes} tally={tally} seated={SEATED} />)

    expect(screen.getByText(/a hung council/i)).toBeInTheDocument()
    expect(screen.queryByText(/leans toward/i)).not.toBeInTheDocument()
  })

  it('shows the clerk still counting while loading', () => {
    render(<VoteStage votes={[]} tally={null} seated={SEATED} loading />)
    expect(screen.getByText(/counts the hands/i)).toBeInTheDocument()
  })
})
