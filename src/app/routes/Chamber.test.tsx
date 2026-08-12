import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Chamber } from './Chamber'
import type { Audience } from '@/domain/audience'
import { createAudience } from '@/engine/audience-machine'

function renderChamber(entry: { pathname: string; state?: unknown }) {
  const router = createMemoryRouter(
    [{ path: '/audience/:id', Component: Chamber }],
    { initialEntries: [entry] },
  )
  return render(<RouterProvider router={router} />)
}

function petitioning(): Audience {
  const base = createAudience({
    id: 'aud-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    question: 'Should I take the Duke up on his offer?',
    seated: ['vane', 'marrow', 'grin'],
  })
  return { ...base, stage: 'petition' }
}

describe('Chamber (T-17/T-18)', () => {
  it('opens the scene on the matter and the petition row', () => {
    renderChamber({
      pathname: '/audience/aud-1',
      state: { audience: petitioning() },
    })

    expect(
      screen.getByRole('heading', {
        name: 'Should I take the Duke up on his offer?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /petitions/i })).toBeInTheDocument()
  })

  it('rises the court when arrived at cold, with no audience in hand', () => {
    renderChamber({ pathname: '/audience/aud-1' })

    expect(
      screen.getByRole('heading', { name: /the court has risen/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /seek an audience/i }),
    ).toBeInTheDocument()
  })
})
