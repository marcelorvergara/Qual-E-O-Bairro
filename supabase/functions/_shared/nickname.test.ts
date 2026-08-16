import { describe, expect, it } from 'vitest'
import { validateNickname } from './nickname'

describe('validateNickname', () => {
  it('trims a valid nickname', () => {
    expect(validateNickname('  Carioca  ')).toEqual({
      ok: true,
      value: 'Carioca',
    })
  })

  it.each([undefined, '', '   '])('rejects an empty value: %s', (value) => {
    expect(validateNickname(value)).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects values over 20 Unicode characters', () => {
    expect(validateNickname('a'.repeat(21))).toEqual({
      ok: false,
      reason: 'too_long',
    })
    expect(validateNickname('😀'.repeat(20)).ok).toBe(true)
  })

  it('rejects control characters', () => {
    expect(validateNickname('Rio\nSul')).toEqual({
      ok: false,
      reason: 'control',
    })
  })

  it.each(['porra', 'PÔRRA total', 'what the FUCK', 'merda!'])(
    'rejects normalized profanity: %s',
    (value) => {
      expect(validateNickname(value)).toEqual({
        ok: false,
        reason: 'profanity',
      })
    },
  )

  it('matches whole words to limit false positives', () => {
    expect(validateNickname('Cuca')).toEqual({ ok: true, value: 'Cuca' })
  })
})
