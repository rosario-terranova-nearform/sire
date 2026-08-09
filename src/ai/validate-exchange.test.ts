import { describe, expect, it } from 'vitest'
import {
  BANNED_PHRASES,
  deriveTargetId,
  findBannedPhrases,
  findNamedCounselors,
  nameTokens,
  validateExchange,
  violationReasons,
} from './validate-exchange'
import { COUNSELORS_BY_ID } from '@/content/counselors'
import { SEATED } from '@/test/ai-fixtures'

const ctx = { seated: SEATED, roster: COUNSELORS_BY_ID }
const fullCourt = {
  seated: ['vane', 'marrow', 'grin', 'verity', 'wren'],
  roster: COUNSELORS_BY_ID,
}

describe('naming a counselor on the floor', () => {
  it('takes the distinctive words of a name and an office', () => {
    expect(nameTokens(COUNSELORS_BY_ID.vane)).toEqual(
      expect.arrayContaining(['vane', 'marshal', 'host']),
    )
    // Honorifics and filler are too weak to name anybody.
    expect(nameTokens(COUNSELORS_BY_ID.vane)).not.toContain('lord')
    expect(nameTokens(COUNSELORS_BY_ID.hob)).not.toContain('old')
  })

  it('finds a counselor by name or by office', () => {
    expect(findNamedCounselors('Marrow prices a siege.', ctx)).toEqual([
      'marrow',
    ])
    expect(findNamedCounselors('The Marshal says midsummer.', ctx)).toEqual([
      'vane',
    ])
    expect(findNamedCounselors("The Keeper's ledger is short.", ctx)).toEqual([
      'marrow',
    ])
  })

  it('drops an office two seated counselors could both answer to', () => {
    // Marrow is Mistress of Coin, Wren is Mistress of Whispers.
    expect(
      findNamedCounselors('The Mistress is wrong, sire.', fullCourt),
    ).toEqual([])
  })

  it('orders by first mention and never names the speaker', () => {
    const text = 'Hob buries them and Marrow counts them, sire.'

    expect(findNamedCounselors(text, ctx)).toEqual(['hob', 'marrow'])
    expect(findNamedCounselors(text, ctx, { exclude: 'hob' })).toEqual([
      'marrow',
    ])
  })

  it('takes the first rival named as the target', () => {
    const target = deriveTargetId(
      'Marrow counts, and Hob digs, and neither of them is right.',
      { counselorId: 'vane' },
      ctx,
    )

    expect(target).toBe('marrow')
  })
})

describe('the anti-sycophancy contract (§5.4)', () => {
  it('passes a turn that disputes a named rival', () => {
    const result = validateExchange(
      {
        counselorId: 'vane',
        text: 'Marrow prices a siege she has never stood in, sire.',
      },
      ctx,
    )

    expect(result).toMatchObject({ ok: true, targetId: 'marrow' })
  })

  it('rejects a turn that names nobody', () => {
    const result = validateExchange(
      {
        counselorId: 'vane',
        text: 'The council is wrong and I am right, sire.',
      },
      ctx,
    )

    expect(result.ok).toBe(false)
    expect(result.violations).toContain('no-target-named')
    expect(result.targetId).toBeNull()
  })

  it('rejects every banned phrase, whatever the casing', () => {
    for (const phrase of BANNED_PHRASES) {
      const result = validateExchange(
        {
          counselorId: 'vane',
          text: `${phrase.toUpperCase()} with Marrow, sire.`,
        },
        ctx,
      )

      expect(result.ok).toBe(false)
      expect(result.violations).toContain('banned-phrase')
      expect(result.bannedFound).toContain(phrase)
    }
  })

  it('rejects an empty turn', () => {
    const result = validateExchange({ counselorId: 'vane', text: '   ' }, ctx)

    expect(result.violations).toContain('empty')
  })

  it('rejects a target who is not at this table', () => {
    const result = validateExchange(
      {
        counselorId: 'vane',
        text: 'Marrow is wrong, sire.',
        targetId: 'wren',
      },
      ctx,
    )

    expect(result.ok).toBe(false)
    expect(result.violations).toContain('target-not-seated')
  })

  it('rejects a counselor disputing themselves', () => {
    const result = validateExchange(
      {
        counselorId: 'vane',
        text: 'Vane is wrong, and Vane knows it.',
        targetId: 'vane',
      },
      ctx,
    )

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining(['no-target-named', 'target-not-seated']),
    )
  })

  it('turns violations into reminders a counselor can act on', () => {
    const reasons = violationReasons({
      violations: ['no-target-named', 'banned-phrase'],
      bannedFound: ['I agree'],
    })

    expect(reasons).toHaveLength(2)
    expect(reasons.join(' ')).toContain('named no one')
    expect(reasons.join(' ')).toContain('"I agree"')
  })

  it('finds a banned phrase mid-sentence', () => {
    expect(findBannedPhrases('Sire, I agree with the Keeper.')).toEqual([
      'I agree',
    ])
    expect(findBannedPhrases('Sire, the Keeper is a fool.')).toEqual([])
  })
})
