// T-04: placeholder sprite pipeline. Generates flat-color/geometric 32x32
// sheets (4 frames: neutral, pleased, appalled, scheming) for the seed
// council (spec §4). Real character art swaps into the same sheet format
// later without touching the <Sprite> component.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'sprites')

const FRAME_SIZE = 32
const FRAME_ORDER = ['neutral', 'pleased', 'appalled', 'scheming']
const SHEET_WIDTH = FRAME_SIZE * FRAME_ORDER.length
const SHEET_HEIGHT = FRAME_SIZE

function hex(h) {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
}

function lighten([r, g, b, a], amount) {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
    a,
  ]
}

const INK = hex('#241c13')
const GOLD = hex('#b8863b')
const WAX = hex('#7e2430')
const GREEN = hex('#5b7a3a')

// One base colour per counselor, distinct enough to tell apart at a glance
// on the seating grid even before any real art exists.
const COUNSELORS = [
  { id: 'vane', color: hex('#7e2430') },
  { id: 'marrow', color: hex('#b8863b') },
  { id: 'grin', color: hex('#c9438c') },
  { id: 'verity', color: hex('#4f5fa8') },
  { id: 'wren', color: hex('#4b3b6b') },
  { id: 'hob', color: hex('#5b7a3a') },
]

function setPixel(buffer, width, x, y, color) {
  const i = (y * width + x) * 4
  buffer[i] = color[0]
  buffer[i + 1] = color[1]
  buffer[i + 2] = color[2]
  buffer[i + 3] = color[3]
}

function rect(buffer, width, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      setPixel(buffer, width, x, y, color)
    }
  }
}

function drawFrame(buffer, width, offsetX, baseColor, mood) {
  const face = lighten(baseColor, 0.35)

  rect(buffer, width, offsetX, 0, FRAME_SIZE, FRAME_SIZE, INK)
  rect(buffer, width, offsetX + 1, 1, FRAME_SIZE - 2, FRAME_SIZE - 2, baseColor)
  rect(buffer, width, offsetX + 8, 8, 16, 16, face)

  const eyeY = mood === 'appalled' ? 12 : 13
  const eyeH = mood === 'scheming' ? 1 : mood === 'appalled' ? 3 : 2
  rect(buffer, width, offsetX + 12, eyeY, 2, eyeH, INK)
  rect(buffer, width, offsetX + 18, eyeY, 2, mood === 'appalled' ? 3 : 2, INK)

  const browY = mood === 'appalled' ? 9 : mood === 'scheming' ? 10 : 11
  rect(buffer, width, offsetX + 12, browY, 2, 1, INK)
  rect(
    buffer,
    width,
    offsetX + 18,
    browY - (mood === 'scheming' ? 2 : 0),
    2,
    1,
    INK,
  )

  if (mood === 'neutral') {
    rect(buffer, width, offsetX + 13, 20, 6, 1, INK)
  } else if (mood === 'pleased') {
    rect(buffer, width, offsetX + 13, 20, 6, 1, GOLD)
    setPixel(buffer, width, offsetX + 12, 19, GOLD)
    setPixel(buffer, width, offsetX + 19, 19, GOLD)
  } else if (mood === 'appalled') {
    rect(buffer, width, offsetX + 13, 19, 6, 4, WAX)
  } else if (mood === 'scheming') {
    rect(buffer, width, offsetX + 13, 20, 4, 1, GREEN)
    setPixel(buffer, width, offsetX + 17, 19, GREEN)
  }
}

let crcTable
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      }
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idatData = deflateSync(raw)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

for (const { id, color } of COUNSELORS) {
  const buffer = Buffer.alloc(SHEET_WIDTH * SHEET_HEIGHT * 4)
  FRAME_ORDER.forEach((mood, i) => {
    drawFrame(buffer, SHEET_WIDTH, i * FRAME_SIZE, color, mood)
  })
  const png = encodePNG(SHEET_WIDTH, SHEET_HEIGHT, buffer)
  writeFileSync(join(OUT_DIR, `${id}.png`), png)
  console.log(`wrote public/sprites/${id}.png`)
}
