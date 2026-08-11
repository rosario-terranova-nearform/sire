import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionComposer } from './QuestionComposer'
import { EXAMPLE_QUESTIONS } from '@/content/example-questions'
import { MAX_QUESTION_LENGTH } from '@/domain/audience'

function type(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

describe('QuestionComposer', () => {
  it('disables submit until the question is non-empty', () => {
    render(<QuestionComposer onSubmit={vi.fn()} />)

    const submit = screen.getByRole('button', { name: /seek counsel/i })
    expect(submit).toBeDisabled()

    type('Should we march on Harrow?')
    expect(submit).toBeEnabled()
  })

  it('submits the trimmed question', () => {
    const onSubmit = vi.fn()
    render(<QuestionComposer onSubmit={onSubmit} />)

    type('  Tax the barons?  ')
    fireEvent.click(screen.getByRole('button', { name: /seek counsel/i }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Tax the barons?')
  })

  it('does not submit a whitespace-only question', () => {
    const onSubmit = vi.fn()
    render(<QuestionComposer onSubmit={onSubmit} />)

    type('     ')
    expect(screen.getByRole('button', { name: /seek counsel/i })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('counts characters against the cap', () => {
    render(<QuestionComposer onSubmit={vi.fn()} />)

    expect(screen.getByText(`0 / ${MAX_QUESTION_LENGTH}`)).toBeInTheDocument()
    type('abcde')
    expect(screen.getByText(`5 / ${MAX_QUESTION_LENGTH}`)).toBeInTheDocument()
  })

  it('fills the field when an example prompt is clicked', () => {
    render(<QuestionComposer onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: EXAMPLE_QUESTIONS[0] }))
    expect(screen.getByRole('textbox')).toHaveValue(EXAMPLE_QUESTIONS[0])
  })

  it('submits on Enter but not on Shift+Enter', () => {
    const onSubmit = vi.fn()
    render(<QuestionComposer onSubmit={onSubmit} />)

    const field = screen.getByRole('textbox')
    type('A question worth asking')

    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('respects the maxLength cap on the field', () => {
    render(<QuestionComposer onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'maxLength',
      String(MAX_QUESTION_LENGTH),
    )
  })
})
