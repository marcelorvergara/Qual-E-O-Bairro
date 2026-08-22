import { describe, expect, it } from 'vitest'
import { dateInSaoPaulo, hintText, puzzleNumberForDate } from './daily-logic'

describe('daily dates', () => {
  it('numbers the epoch as puzzle one', () => {
    expect(puzzleNumberForDate('2026-08-15')).toBe(1)
    expect(puzzleNumberForDate('2026-08-16')).toBe(2)
  })

  it('rolls over at midnight in America/Sao_Paulo, not UTC', () => {
    expect(dateInSaoPaulo(new Date('2026-08-16T00:00:00Z'))).toBe('2026-08-15')
    expect(dateInSaoPaulo(new Date('2026-08-16T02:59:59Z'))).toBe('2026-08-15')
    expect(dateInSaoPaulo(new Date('2026-08-16T03:00:00Z'))).toBe('2026-08-16')
  })
})

it('looks up hint tiers in order and rejects invalid tiers', () => {
  const hints = { A: { region: 'r', character: 'c', giveaway: 'g' } }
  expect([1, 2, 3].map((tier) => hintText(hints, 'A', tier))).toEqual([
    'r',
    'c',
    'g',
  ])
  expect(hintText(hints, 'A', 4)).toBeNull()
})
