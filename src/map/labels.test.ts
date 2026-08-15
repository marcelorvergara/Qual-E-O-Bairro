import { describe, expect, it } from 'vitest'
import { layoutLabels, rectsOverlap } from './labels'

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

  it('rejects an east placement outside the viewBox and uses the west side', () => {
    const [label] = layoutLabels(
      [
        {
          cod: '001',
          anchor: [92, 50],
          bounds: [
            [90, 45],
            [94, 55],
          ],
          width: 30,
          height: 10,
        },
      ],
      { width: 100, height: 100 },
    )
    expect(label.x).toBeLessThan(92)
    expect(label.rect.right).toBeLessThanOrEqual(96)
  })
})
