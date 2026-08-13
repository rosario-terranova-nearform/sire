import type { Audience } from '@/domain/audience'
import type { CounselorRoster, SpriteState } from '@/domain/counselor'
import type { Reign } from '@/domain/reign'
import { COUNSELORS_BY_ID } from '@/content/counselors'

/**
 * §8.1 (7) / T-20 — render the finished scene to a PNG for sharing.
 *
 * The scene is captured as a plain data snapshot first (`buildSceneSnapshot`,
 * pure and testable), then drawn onto a canvas (`renderSceneToCanvas`) and
 * encoded (`exportScenePng`). Splitting it this way lets the "PNG contains the
 * question, petitions, decree, and reactions" guarantee be asserted against the
 * snapshot, where jsdom cannot rasterise a real canvas.
 */

export interface ScenePetition {
  name: string
  text: string
}

export interface SceneReaction {
  name: string
  mood: SpriteState
  line: string
  favorDelta: number
}

export interface SceneSnapshot {
  monarchName: string
  question: string
  petitions: ScenePetition[]
  decree: string
  sidedWithName?: string
  reactions: SceneReaction[]
}

/** The court palette, mirrored from `index.css` so the PNG reads as the app. */
const PALETTE = {
  parchment: '#e8d9ae',
  ink: '#241c13',
  wax: '#7e2430',
  gold: '#b8863b',
  stone: '#6e6a5e',
  green: '#5b7a3a',
} as const

export function buildSceneSnapshot(
  audience: Audience,
  reign: Reign,
  roster: CounselorRoster = COUNSELORS_BY_ID,
): SceneSnapshot {
  const nameOf = (id: string) => roster[id]?.name ?? id

  return {
    monarchName: reign.monarchName,
    question: audience.question,
    petitions: audience.seated
      .map((id) => {
        const petition = audience.petitions.find((p) => p.counselorId === id)
        const text = petition?.text.trim() ?? ''
        return { name: nameOf(id), text }
      })
      .filter((entry) => entry.text.length > 0),
    decree: audience.decree?.text ?? '',
    sidedWithName:
      audience.decree?.sidedWithId !== undefined
        ? nameOf(audience.decree.sidedWithId)
        : undefined,
    reactions: audience.reactions.map((reaction) => ({
      name: nameOf(reaction.counselorId),
      mood: reaction.mood,
      line: reaction.line,
      favorDelta: reaction.favorDelta,
    })),
  }
}

const WIDTH = 900
const MARGIN = 48
const BODY = 'IBM Plex Sans Variable, system-ui, sans-serif'
const HEADING = 'Pixelify Sans, system-ui, sans-serif'

/**
 * Draw the snapshot onto a fresh canvas, growing its height to fit. Returns the
 * canvas so the caller can encode it or attach it to the DOM.
 */
export function renderSceneToCanvas(snapshot: SceneSnapshot): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    // No 2D context (a headless or blocked canvas). Hand back an empty canvas
    // rather than throwing — sharing is a nicety, never a stage the app owes.
    canvas.width = WIDTH
    canvas.height = WIDTH
    return canvas
  }

  // A two-pass draw: measure the needed height against a scratch context, size
  // the canvas, then paint. Sizing a canvas clears it, so painting must come
  // last.
  const contentWidth = WIDTH - MARGIN * 2
  const height = measureSceneHeight(ctx, snapshot, contentWidth)
  canvas.width = WIDTH
  canvas.height = height

  paintScene(ctx, snapshot, contentWidth, height)
  return canvas
}

/** Encode the scene as a PNG blob. Rejects only if the canvas cannot encode. */
export function exportScenePng(snapshot: SceneSnapshot): Promise<Blob> {
  const canvas = renderSceneToCanvas(snapshot)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('The scene could not be drawn to an image.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

/** A filename for the downloaded scene, safe on every platform. */
export function sceneFileName(snapshot: SceneSnapshot): string {
  const slug = snapshot.question
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
  return `sire-decree${slug ? `-${slug}` : ''}.png`
}

/* ------------------------------------------------------------- drawing guts */

const LINE_HEIGHT = 26
const GAP = 20

/** Layout is deterministic given the fonts; the same walk measures and paints. */
function walkScene(
  ctx: CanvasRenderingContext2D,
  snapshot: SceneSnapshot,
  contentWidth: number,
  paint: boolean,
): number {
  let y = MARGIN

  const line = (
    text: string,
    font: string,
    color: string,
    lineHeight = LINE_HEIGHT,
  ) => {
    ctx.font = font
    const wrapped = wrapText(ctx, text, contentWidth)
    for (const row of wrapped) {
      if (paint) {
        ctx.fillStyle = color
        ctx.fillText(row, MARGIN, y)
      }
      y += lineHeight
    }
  }

  // Crest line.
  line(`The court of ${snapshot.monarchName}`, `20px ${HEADING}`, PALETTE.gold, 30)
  y += GAP

  // The matter.
  line('THE MATTER', `14px ${BODY}`, PALETTE.stone, 20)
  line(snapshot.question, `26px ${HEADING}`, PALETTE.ink, 32)
  y += GAP

  // Petitions.
  if (snapshot.petitions.length > 0) {
    line('THE COURT PETITIONED', `14px ${BODY}`, PALETTE.stone, 20)
    for (const petition of snapshot.petitions) {
      line(petition.name, `18px ${HEADING}`, PALETTE.wax, 24)
      line(petition.text, `16px ${BODY}`, PALETTE.ink)
      y += 10
    }
    y += GAP
  }

  // The decree.
  line('THE DECREE', `14px ${BODY}`, PALETTE.stone, 20)
  line(snapshot.decree, `20px ${HEADING}`, PALETTE.ink, 28)
  if (snapshot.sidedWithName !== undefined) {
    line(`— sided with ${snapshot.sidedWithName}`, `15px ${BODY}`, PALETTE.stone, 22)
  }
  y += GAP

  // The reactions.
  if (snapshot.reactions.length > 0) {
    line('THE COURT REACTED', `14px ${BODY}`, PALETTE.stone, 20)
    for (const reaction of snapshot.reactions) {
      const delta =
        reaction.favorDelta > 0 ? `+${reaction.favorDelta}` : `${reaction.favorDelta}`
      const color =
        reaction.favorDelta > 0
          ? PALETTE.green
          : reaction.favorDelta < 0
            ? PALETTE.wax
            : PALETTE.stone
      line(`${reaction.name} (${reaction.mood}, ${delta})`, `16px ${HEADING}`, color, 22)
      line(`“${reaction.line}”`, `16px ${BODY}`, PALETTE.ink)
      y += 8
    }
  }

  return y + MARGIN
}

function measureSceneHeight(
  ctx: CanvasRenderingContext2D,
  snapshot: SceneSnapshot,
  contentWidth: number,
): number {
  return walkScene(ctx, snapshot, contentWidth, false)
}

function paintScene(
  ctx: CanvasRenderingContext2D,
  snapshot: SceneSnapshot,
  contentWidth: number,
  height: number,
): void {
  ctx.fillStyle = PALETTE.parchment
  ctx.fillRect(0, 0, WIDTH, height)
  // A thick ink frame, in the pixel-court manner.
  ctx.strokeStyle = PALETTE.ink
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, WIDTH - 8, height - 8)

  ctx.textBaseline = 'top'
  walkScene(ctx, snapshot, contentWidth, true)
}

/** Greedy word wrap against the current `ctx.font`. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/u).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let line = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`
    if (ctx.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  lines.push(line)
  return lines
}
