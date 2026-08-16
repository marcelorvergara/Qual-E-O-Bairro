import { describe, expect, it } from 'vitest'
import { fitExplainer } from './explainer'

describe('explainer fitting', () => {
  it('keeps a valid response and normalizes whitespace', () => {
    expect(fitExplainer('  Uma frase.\n  Outra frase.  ')).toBe(
      'Uma frase. Outra frase.',
    )
  })

  it('truncates an oversized response at its last sentence boundary', () => {
    const value = `${'A'.repeat(180)}. ${'B'.repeat(180)}. ${'C'.repeat(180)}.`
    const fitted = fitExplainer(value)
    expect(fitted).toBe(`${'A'.repeat(180)}. ${'B'.repeat(180)}.`)
    expect(Array.from(fitted ?? '')).toHaveLength(363)
  })

  it('uses a bounded ellipsis when no sentence boundary is available', () => {
    const fitted = fitExplainer('A'.repeat(500))
    expect(fitted?.endsWith('…')).toBe(true)
    expect(Array.from(fitted ?? '')).toHaveLength(400)
  })

  it('rejects an empty response', () => {
    expect(fitExplainer('  \n ')).toBeNull()
  })
})
