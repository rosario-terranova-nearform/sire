import { describe, expect, it } from 'vitest'
import { DEMO_AUDIENCE } from '@/content/demo-audience'
import { createDefaultReign } from './reign'
import { buildSceneSnapshot, sceneFileName } from './share-scene'

const REIGN = createDefaultReign('Rosario the Unbothered')

describe('buildSceneSnapshot (T-20)', () => {
  it('captures the question, petitions, decree, and reactions', () => {
    const snapshot = buildSceneSnapshot(DEMO_AUDIENCE, REIGN)

    expect(snapshot.monarchName).toBe('Rosario the Unbothered')
    expect(snapshot.question).toBe(DEMO_AUDIENCE.question)
    expect(snapshot.decree).toBe(DEMO_AUDIENCE.decree?.text)

    // Every seated counselor who actually spoke is present, by name and word.
    expect(snapshot.petitions.length).toBe(DEMO_AUDIENCE.seated.length)
    for (const petition of snapshot.petitions) {
      expect(petition.name.length).toBeGreaterThan(0)
      expect(petition.text.length).toBeGreaterThan(0)
    }

    expect(snapshot.reactions.length).toBe(DEMO_AUDIENCE.reactions.length)
    for (const reaction of snapshot.reactions) {
      expect(reaction.line.length).toBeGreaterThan(0)
    }
  })

  it('resolves the sided-with counselor to a name', () => {
    const snapshot = buildSceneSnapshot(DEMO_AUDIENCE, REIGN)
    // The demo decree sided with Wren.
    expect(snapshot.sidedWithName).toBe('Wren')
  })

  it('omits petitions from counselors who held their tongue', () => {
    const audience = {
      ...DEMO_AUDIENCE,
      petitions: DEMO_AUDIENCE.petitions.map((p, i) =>
        i === 0 ? { ...p, text: '' } : p,
      ),
    }
    const snapshot = buildSceneSnapshot(audience, REIGN)
    expect(snapshot.petitions.length).toBe(DEMO_AUDIENCE.seated.length - 1)
  })

  it('names the file from the question, safely', () => {
    const name = sceneFileName(buildSceneSnapshot(DEMO_AUDIENCE, REIGN))
    expect(name).toMatch(/^sire-decree.*\.png$/)
    expect(name).not.toMatch(/[^a-z0-9.-]/)
  })
})
