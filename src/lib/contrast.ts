/**
 * T-24 — WCAG contrast, so "verify contrast on parchment surfaces" is a
 * deterministic check and not a hope.
 *
 * The court palette (`src/index.css`) is five named hues plus one functional
 * green, and every semantic token is either one of those or a `color-mix` of
 * them in the sRGB space. This module resolves those mixes and computes the
 * WCAG 2.1 contrast ratio between any two, so a test can assert the pairs that
 * carry real text clear AA — 4.5:1 for body copy, 3:1 for large text — in both
 * the day (parchment) and night (ink) palettes.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** `#rgb` or `#rrggbb` → channel bytes. Throws on anything else, so a typo in
 *  a resolved token is a test failure, not a silent 0. */
export function parseHex(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex color: "${hex}"`)
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/**
 * `color-mix(in srgb, a p%, b)` — a per-channel blend of the gamma-encoded
 * sRGB bytes, which is exactly what mixing "in srgb" does. `portionA` is the
 * `p%` weight on `a` (0…1); `b` takes the remainder.
 */
export function mixSrgb(a: Rgb, b: Rgb, portionA: number): Rgb {
  const p = Math.max(0, Math.min(1, portionA))
  const blend = (ca: number, cb: number) => Math.round(ca * p + cb * (1 - p))
  return { r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b) }
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (byte: number) => {
    const c = byte / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1…21, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}
