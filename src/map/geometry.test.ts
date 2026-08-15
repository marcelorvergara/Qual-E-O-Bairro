import { describe, expect, it } from 'vitest'
import { geoBounds } from 'd3-geo'
import { bairros, createBairroPaths } from './geometry'

const requiredProperties = ['codbairro', 'nome', 'rp', 'regiao_adm']

describe('bairro GeoJSON', () => {
  it('contains all 166 bairros with the four required properties', () => {
    expect(bairros.features).toHaveLength(166)
    for (const feature of bairros.features) {
      expect(Object.keys(feature.properties)).toEqual(requiredProperties)
      for (const property of requiredProperties) {
        expect(
          feature.properties[property as keyof typeof feature.properties],
        ).toBeTruthy()
      }
    }
  })

  it.each([
    [360, 640],
    [1440, 900],
  ])('renders every path at %d×%d', (viewportWidth, viewportHeight) => {
    const paths = createBairroPaths(viewportWidth, viewportHeight * 0.8)
    expect(paths).toHaveLength(166)
    expect(paths.every(({ path }) => path.startsWith('M'))).toBe(true)
  })

  it('keeps Rio in its expected hemisphere after adapting ring winding for D3', () => {
    const [[west, south], [east, north]] = geoBounds(bairros)
    expect(west).toBeGreaterThan(-44)
    expect(east).toBeLessThan(-43)
    expect(south).toBeGreaterThan(-24)
    expect(north).toBeLessThan(-22)
  })
})
