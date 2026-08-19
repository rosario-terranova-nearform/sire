import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DecreeStage } from './DecreeStage'

const SEATED = ['vane', 'marrow', 'grin']

describe('DecreeStage (T-19)', () => {
  it('seals a written decree with the counselor the monarch sided with', () => {
    const onIssue = vi.fn()
    render(<DecreeStage seated={SEATED} onIssue={onIssue} />)

    fireEvent.change(screen.getByLabelText(/your decree/i), {
      target: { value: 'Let the marriage be made.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Lord Marshal Vane/i }))
    fireEvent.click(screen.getByRole('button', { name: /seal the decree/i }))

    expect(onIssue).toHaveBeenCalledWith('Let the marriage be made.', 'vane')
  })

  it('will not seal an empty ruling', () => {
    const onIssue = vi.fn()
    render(<DecreeStage seated={SEATED} onIssue={onIssue} />)

    expect(screen.getByRole('button', { name: /seal the decree/i })).toBeDisabled()
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('rules in one tap with a quick decree', () => {
    const onIssue = vi.fn()
    render(<DecreeStage seated={SEATED} onIssue={onIssue} />)

    fireEvent.click(screen.getByRole('button', { name: 'Denied.' }))
    expect(onIssue).toHaveBeenCalledWith('Denied.', undefined)
  })

  // T-25 — a resumed, finished audience shows the sealed ruling, read-only.
  it('shows the sealed ruling and no form when a decree already stands', () => {
    const onIssue = vi.fn()
    render(
      <DecreeStage
        seated={SEATED}
        onIssue={onIssue}
        issued={{
          text: 'Let the marriage be made.',
          sidedWithId: 'vane',
          issuedAt: '2026-08-12T00:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByText(/let the marriage be made/i)).toBeInTheDocument()
    expect(screen.getByText(/you sided with/i)).toBeInTheDocument()
    // No editable form, no seal button, nothing left to rule.
    expect(screen.queryByLabelText(/your decree/i)).toBeNull()
    expect(
      screen.queryByRole('button', { name: /seal the decree/i }),
    ).toBeNull()
  })
})
