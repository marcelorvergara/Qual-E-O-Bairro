import { describe, expect, it } from 'vitest'
import { shouldShowHintExplanation, shouldShowNoResults } from './presentation'

describe('presentation state', () => {
  it('shows no results only for a non-empty normalized query with no matches', () => {
    expect(shouldShowNoResults('', 0)).toBe(false)
    expect(shouldShowNoResults('   ', 0)).toBe(false)
    expect(shouldShowNoResults('copacabana', 1)).toBe(false)
    expect(shouldShowNoResults('bairro inexistente', 0)).toBe(true)
  })

  it('shows the ranking hint explanation in daily mode only', () => {
    expect(shouldShowHintExplanation('daily', true)).toBe(true)
    expect(shouldShowHintExplanation('daily', false)).toBe(false)
    expect(shouldShowHintExplanation('practice', true)).toBe(false)
  })
})
