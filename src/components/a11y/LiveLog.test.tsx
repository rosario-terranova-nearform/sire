import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveLog } from './LiveLog'

describe('LiveLog (T-24)', () => {
  it('is a polite log region named for assistive tech', () => {
    const { getByRole } = render(
      <LiveLog messages={['Vane petitions: to war']} label="Court transcript" />,
    )
    const log = getByRole('log', { name: 'Court transcript' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    // Off-screen: it announces, it does not take layout.
    expect(log).toHaveClass('sr-only')
  })

  it('renders one entry per message, in order', () => {
    const { getByRole } = render(
      <LiveLog
        messages={['first turn', 'second turn', 'third turn']}
        label="Court transcript"
      />,
    )
    const log = getByRole('log')
    expect(log.textContent).toBe('first turnsecond turnthird turn')
    expect(log.querySelectorAll('p')).toHaveLength(3)
  })
})
