import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AudienceNew } from './AudienceNew'
import { COUNSELORS } from '@/content/counselors'

function askAndSubmit(question: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: /seek counsel/i }))
}

describe('AudienceNew (T-15)', () => {
  it('advances a valid question to seating and reveals the council', () => {
    render(<AudienceNew />)
    askAndSubmit('Should we march on Harrow before the thaw?')

    // The machine reached `seating`: the question is shown as the matter, the
    // composer is gone, and the whole roster is on screen.
    expect(screen.getByText(/the matter before the court/i)).toBeInTheDocument()
    expect(
      screen.getByText('Should we march on Harrow before the thaw?'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    for (const counselor of COUNSELORS) {
      expect(screen.getByText(counselor.name)).toBeInTheDocument()
    }
  })

  it('adjourns a crisis-flagged question and does not advance', () => {
    render(<AudienceNew />)
    askAndSubmit('I want to kill myself')

    // The adjournment card is shown, the composer stays put, and no council is
    // revealed — the machine did not leave `composing`.
    expect(screen.getByRole('alert')).toHaveTextContent(/court is adjourned/i)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(
      screen.queryByText(/the matter before the court/i),
    ).not.toBeInTheDocument()
  })

  it('lets the monarch revise an adjourned question and proceed', () => {
    render(<AudienceNew />)

    askAndSubmit('I want to kill myself')
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // A safe rewrite clears the adjournment and advances to seating.
    askAndSubmit('Should I fire my co-founder?')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/the matter before the court/i)).toBeInTheDocument()
  })

  it('can return from seating to edit the question', () => {
    render(<AudienceNew />)
    askAndSubmit('Should the royal cat join the council?')

    fireEvent.click(screen.getByRole('button', { name: /change the question/i }))

    // Back in the composer, seeded with the prior question.
    expect(screen.getByRole('textbox')).toHaveValue(
      'Should the royal cat join the council?',
    )
  })
})
