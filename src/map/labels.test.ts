import { describe, expect, it } from 'vitest'
import { rectsOverlap } from './labels'

describe('label overlap', () => {
  const base = { left: 0, top: 0, right: 10, bottom: 10 }

  it('detects intersection but allows touching edges', () => {
    expect(rectsOverlap(base, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(
      true,
    )
    expect(rectsOverlap(base, { left: 10, top: 2, right: 15, bottom: 8 })).toBe(
      false,
    )
  })
})
