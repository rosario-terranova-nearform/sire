import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { Chamber } from './Chamber'
import type { Audience } from '@/domain/audience'
import { createAudience } from '@/engine/audience-machine'
import { repository } from '@/lib/repository'

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

  it('rises the court when arrived at cold with nothing persisted', () => {
    renderChamber({ pathname: '/audience/unknown-id' })

    expect(
      screen.getByRole('heading', { name: /the court has risen/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /seek an audience/i }),
    ).toBeInTheDocument()
  })
})

describe('Chamber — resume a persisted audience (T-25)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resumes a decree-hold checkpoint on a cold arrival', async () => {
    repository.saveAudience(settled('resume-1', 'decree'))
    renderChamber({ pathname: '/audience/resume-1' })

    // Not risen — the matter and the decree form are back.
    expect(
      screen.getByRole('heading', {
        name: 'Should I take the Duke up on his offer?',
      }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText(/your decree/i)).toBeInTheDocument(),
    )
  })

  it('reopens a finished audience showing the sealed decree', async () => {
    repository.saveAudience(settled('resume-2', 'aftermath'))
    renderChamber({ pathname: '/audience/resume-2' })

    await waitFor(() =>
      expect(screen.getByText(/so be it/i)).toBeInTheDocument(),
    )
    // The ruling stands, read-only: no editable form.
    expect(screen.queryByLabelText(/your decree/i)).toBeNull()
  })
})

/** A persisted audience past the AI stages, at a decree hold or finished. */
function settled(id: string, stage: 'decree' | 'aftermath'): Audience {
  const seated = ['vane', 'marrow', 'grin']
  const base = createAudience({
    id,
    createdAt: '2026-08-12T00:00:00.000Z',
    question: 'Should I take the Duke up on his offer?',
    seated,
  })
  const petitions = seated.map((counselorId) => ({
    counselorId,
    text: 'A petition, sire.',
    complete: true,
  }))
  const deliberation = seated.map((counselorId, order) => ({
    counselorId,
    targetId: seated.find((other) => other !== counselorId) ?? counselorId,
    text: 'I dispute that.',
    order,
  }))
  const votes = seated.map((voterId) => ({
    voterId,
    forId: seated.find((other) => other !== voterId) ?? voterId,
    rationale: 'so',
  }))
  if (stage === 'decree') {
    return { ...base, stage: 'decree', petitions, deliberation, votes }
  }
  return {
    ...base,
    stage: 'aftermath',
    petitions,
    deliberation,
    votes,
    decree: { text: 'So be it.', issuedAt: '2026-08-12T01:00:00.000Z' },
    reactions: seated.map((counselorId) => ({
      counselorId,
      mood: 'pleased' as const,
      line: 'As you say.',
      favorDelta: 1,
    })),
  }
}
