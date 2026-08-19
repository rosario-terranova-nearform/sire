import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sprite } from './Sprite'
import { SPRITE_FRAME_ORDER, type SpriteState } from '@/lib/sprite'

const COUNSELOR_IDS = ['vane', 'marrow', 'grin', 'verity', 'wren', 'hob']

describe('Sprite', () => {
  it('renders all 6 counselors x 4 states at x2 and x4 without throwing', () => {
    for (const counselorId of COUNSELOR_IDS) {
      for (const state of SPRITE_FRAME_ORDER) {
        for (const scale of [2, 4] as const) {
          const { unmount } = render(
            <Sprite counselorId={counselorId} state={state} scale={scale} />,
          )
          unmount()
        }
      }
    }
  })

  it('keeps a fixed box size across every state at a given scale', () => {
    const sizes = SPRITE_FRAME_ORDER.map((state) => {
      const { getByRole, unmount } = render(
        <Sprite counselorId="vane" state={state} scale={4} />,
      )
      const el = getByRole('img')
      const { width, height } = el.getBoundingClientRect()
      unmount()
      return `${width}x${height}`
    })

    expect(new Set(sizes).size).toBe(1)
  })

  it('shifts background-position by exactly one scaled frame per state', () => {
    const positions: Record<SpriteState, string> = {} as Record<
      SpriteState,
      string
    >
    for (const state of SPRITE_FRAME_ORDER) {
      const { getByRole, unmount } = render(
        <Sprite counselorId="vane" state={state} scale={2} />,
      )
      positions[state] = getByRole('img').style.backgroundPosition
      unmount()
    }

    expect(positions.neutral).toBe('0px 0px')
    expect(positions.pleased).toBe('-64px 0px')
    expect(positions.appalled).toBe('-128px 0px')
    expect(positions.scheming).toBe('-192px 0px')
  })

  it('sizes the sheet to an integer multiple of the 32px frame grid', () => {
    const { getByRole } = render(
      <Sprite counselorId="vane" state="neutral" scale={3} />,
    )
    expect(getByRole('img').style.backgroundSize).toBe('384px 96px')
  })

  // T-24 — alt text per sprite state, naming the counselor and describing the mood.
  it('composes alt text from the counselor name and a readable mood phrase', () => {
    const { getByRole } = render(
      <Sprite counselorId="marrow" name="Keeper Marrow" state="appalled" />,
    )
    expect(getByRole('img')).toHaveAttribute(
      'aria-label',
      'Keeper Marrow, appalled',
    )
  })

  it('falls back to the counselor id when no name is given', () => {
    const { getByRole } = render(<Sprite counselorId="wren" state="scheming" />)
    expect(getByRole('img')).toHaveAttribute('aria-label', 'wren, scheming')
  })

  it('hides a sprite marked decorative from the accessibility tree', () => {
    const { queryByRole, container } = render(
      <Sprite counselorId="vane" state="neutral" alt="" />,
    )
    expect(queryByRole('img')).toBeNull()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
