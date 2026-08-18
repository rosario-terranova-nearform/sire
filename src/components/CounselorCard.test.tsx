import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CounselorCard, type CounselorCardVariant } from './CounselorCard'
import { COUNSELORS, getCounselor } from '@/content/counselors'

const VARIANTS: CounselorCardVariant[] = ['compact', 'speaking', 'full']

const vane = getCounselor('vane')!
const grin = getCounselor('grin')!

describe('CounselorCard', () => {
  it('renders every counselor in every variant, revealed and unrevealed', () => {
    for (const counselor of COUNSELORS) {
      for (const variant of VARIANTS) {
        for (const agendaRevealed of [false, true]) {
          const { unmount } = render(
            <CounselorCard
              counselor={counselor}
              variant={variant}
              agendaRevealed={agendaRevealed}
            />,
          )
          unmount()
        }
      }
    }
  })

  it('shows name, title, and faction badge', () => {
    render(<CounselorCard counselor={vane} variant="compact" />)
    expect(screen.getByText(vane.name)).toBeInTheDocument()
    expect(screen.getByText(vane.title)).toBeInTheDocument()
    expect(screen.getByText(vane.faction)).toBeInTheDocument()
  })

  it('renders the ability name and description', () => {
    render(<CounselorCard counselor={vane} variant="full" />)
    expect(screen.getByText(vane.ability.name)).toBeInTheDocument()
    expect(screen.getByText(vane.ability.description)).toBeInTheDocument()
  })

  it('renders three stat pip rows with accurate values', () => {
    render(<CounselorCard counselor={vane} variant="compact" />)
    // vane: candor 4 / prudence 1 / guile 2
    expect(screen.getByLabelText('candor: 4 of 5')).toBeInTheDocument()
    expect(screen.getByLabelText('prudence: 1 of 5')).toBeInTheDocument()
    expect(screen.getByLabelText('guile: 2 of 5')).toBeInTheDocument()
  })

  it('masks the agenda until revealed', () => {
    const { rerender } = render(
      <CounselorCard counselor={vane} variant="compact" agendaRevealed={false} />,
    )
    expect(screen.getByText('AGENDA: ???')).toBeInTheDocument()
    expect(screen.queryByText(vane.agenda)).not.toBeInTheDocument()

    rerender(
      <CounselorCard counselor={vane} variant="compact" agendaRevealed />,
    )
    expect(screen.queryByText('AGENDA: ???')).not.toBeInTheDocument()
    expect(screen.getByText(vane.agenda)).toBeInTheDocument()
  })

  // T-23: the reveal moment plays a card-flip, but the agenda text is still
  // there — the animation dresses the reveal, it does not gate the content.
  it('shows the agenda through the reveal animation', () => {
    render(
      <CounselorCard
        counselor={vane}
        variant="full"
        agendaRevealed
        animateAgendaReveal
      />,
    )
    expect(screen.getByText(vane.agenda)).toBeInTheDocument()
    expect(screen.queryByText('AGENDA: ???')).not.toBeInTheDocument()
  })

  it('renders the favor indicator only when favor is provided', () => {
    const { rerender } = render(
      <CounselorCard counselor={vane} variant="compact" />,
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    rerender(<CounselorCard counselor={vane} variant="compact" favor={3} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()

    rerender(<CounselorCard counselor={vane} variant="compact" favor={-5} />)
    expect(screen.getByText('-5')).toBeInTheDocument()
  })

  it('renders streaming speech in the speaking variant', () => {
    render(
      <CounselorCard
        counselor={vane}
        variant="speaking"
        speech="Strike in spring, sire."
      />,
    )
    expect(screen.getByText('Strike in spring, sire.')).toBeInTheDocument()
  })

  it('shows an in-world placeholder when speaking with no speech yet', () => {
    render(<CounselorCard counselor={vane} variant="speaking" />)
    expect(
      screen.getByText(`${vane.name} takes the floor…`),
    ).toBeInTheDocument()
  })

  it('omits the stat/ability/agenda block in the speaking variant', () => {
    render(<CounselorCard counselor={vane} variant="speaking" />)
    expect(screen.queryByText('AGENDA: ???')).not.toBeInTheDocument()
    expect(screen.queryByText(vane.ability.name)).not.toBeInTheDocument()
  })

  it('adds the voice block only in the full variant', () => {
    const { rerender } = render(
      <CounselorCard counselor={vane} variant="compact" />,
    )
    expect(screen.queryByText(vane.voice.register)).not.toBeInTheDocument()

    rerender(<CounselorCard counselor={vane} variant="full" />)
    expect(screen.getByText(vane.voice.register)).toBeInTheDocument()
  })

  it('marks the compact card as selected for seating', () => {
    const { container } = render(
      <CounselorCard counselor={grin} variant="compact" selected />,
    )
    const card = container.querySelector('[data-slot="card"]')
    expect(card).toHaveAttribute('data-selected', 'true')
  })

  it('scopes stat pip labels to the card so counselors do not collide', () => {
    render(
      <div>
        <div data-testid="vane-card">
          <CounselorCard counselor={vane} variant="compact" />
        </div>
        <div data-testid="grin-card">
          <CounselorCard counselor={grin} variant="compact" />
        </div>
      </div>,
    )
    // grin: candor 5 / prudence 1 / guile 4
    const grinCard = within(screen.getByTestId('grin-card'))
    expect(grinCard.getByLabelText('candor: 5 of 5')).toBeInTheDocument()
    expect(grinCard.getByLabelText('guile: 4 of 5')).toBeInTheDocument()
  })
})
