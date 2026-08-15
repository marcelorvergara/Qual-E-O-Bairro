import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  booleanIntersects,
  centroid,
  distance,
  lineOverlap,
  point,
} from '@turf/turf'

const bairros = JSON.parse(readFileSync('data/bairros.geojson', 'utf8'))
const features = [...bairros.features].sort((a, b) =>
  a.properties.codbairro.localeCompare(b.properties.codbairro),
)
const codes = features.map(({ properties }) => properties.codbairro)

function boundaryLines(feature) {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  return polygons.flatMap((rings) =>
    rings.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  )
}

const boundaries = features.map(boundaryLines)

function hasSharedBoundary(left, right) {
  return lineOverlap(left, right, { tolerance: 0.001 }).features.length > 0
}

function borderDistance(leftIndex, rightIndex) {
  if (booleanIntersects(features[leftIndex], features[rightIndex])) return 0

  let minimum = Infinity
  const leftLines = boundaries[leftIndex]
  const rightLines = boundaries[rightIndex]

  for (const left of leftLines) {
    for (const right of rightLines) {
      for (const coordinate of left.geometry.coordinates) {
        const candidate = pointToLineDistance(coordinate, right)
        if (candidate < minimum) minimum = candidate
      }
      for (const coordinate of right.geometry.coordinates) {
        const candidate = pointToLineDistance(coordinate, left)
        if (candidate < minimum) minimum = candidate
      }
    }
  }

  return minimum
}

function pointToLineDistance(coordinate, line) {
  let minimum = Infinity
  for (let index = 1; index < line.geometry.coordinates.length; index += 1) {
    const start = line.geometry.coordinates[index - 1]
    const end = line.geometry.coordinates[index]
    const projected = nearestOnSegment(coordinate, start, end)
    minimum = Math.min(minimum, distance(point(coordinate), point(projected)))
  }
  return minimum
}

function nearestOnSegment(target, start, end) {
  const latitude = ((target[1] + start[1] + end[1]) / 3) * (Math.PI / 180)
  const scaleX = Math.cos(latitude)
  const ax = start[0] * scaleX
  const ay = start[1]
  const bx = end[0] * scaleX
  const by = end[1]
  const px = target[0] * scaleX
  const py = target[1]
  const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2
  const ratio = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSquared,
        ),
      )
    : 0
  return [(ax + ratio * (bx - ax)) / scaleX, ay + ratio * (by - ay)]
}

const size = features.length
const km = Array.from({ length: size }, () => Array(size).fill(0))
const adj = Array.from({ length: size }, () => Array(size).fill(false))

for (let left = 0; left < size; left += 1) {
  for (let right = left + 1; right < size; right += 1) {
    const adjacent = hasSharedBoundary(features[left], features[right])
    const separation = adjacent ? 0 : borderDistance(left, right)
    km[left][right] = km[right][left] = Math.round(separation * 10) / 10
    adj[left][right] = adj[right][left] = adjacent
  }
  process.stdout.write(`\rComputed ${left + 1}/${size} bairros`)
}
process.stdout.write('\n')

const indexByName = Object.fromEntries(
  features.map(({ properties }, index) => [properties.nome, index]),
)
const copa = indexByName.Copacabana
const ipanema = indexByName.Ipanema
const santaCruz = indexByName['Santa Cruz']
const paqueta = indexByName['Paquetá']

assert.equal(km[copa][ipanema], 0, 'Copacabana↔Ipanema distance must be 0')
assert.equal(adj[copa][ipanema], true, 'Copacabana↔Ipanema must be adjacent')
// The border check validates the matrix; the centroid span checks city-scale geometry.
assert.ok(
  km[copa][santaCruz] >= 38 && km[copa][santaCruz] <= 48,
  `Copacabana↔Santa Cruz border distance must be 38–48 km; got ${km[copa][santaCruz]}`,
)
const copaSantaCruzSpan = distance(
  centroid(features[copa]),
  centroid(features[santaCruz]),
)
assert.ok(
  copaSantaCruzSpan >= 50 && copaSantaCruzSpan <= 65,
  `Copacabana↔Santa Cruz geographic span must be 50–65 km; got ${copaSantaCruzSpan}`,
)
assert.ok(
  adj[paqueta].every((value) => !value),
  'Paquetá must have no adjacency',
)

for (let left = 0; left < size; left += 1) {
  assert.equal(km[left][left], 0, `km diagonal differs at ${left}`)
  assert.equal(adj[left][left], false, `adj diagonal differs at ${left}`)
  for (let right = 0; right < size; right += 1) {
    assert.equal(
      km[left][right],
      km[right][left],
      `km matrix differs at ${left},${right}`,
    )
    assert.equal(
      adj[left][right],
      adj[right][left],
      `adj matrix differs at ${left},${right}`,
    )
  }
}

writeFileSync('data/matrix.json', `${JSON.stringify({ codes, km, adj })}\n`)
console.log(
  `Sanity: Copacabana↔Ipanema km=${km[copa][ipanema].toFixed(1)}, adjacent=${adj[copa][ipanema]}`,
)
console.log(
  `Sanity: Copacabana↔Santa Cruz border_km=${km[copa][santaCruz].toFixed(1)}, centroid_km=${copaSantaCruzSpan.toFixed(1)}`,
)
console.log(
  `Sanity: Paquetá adjacent_count=${adj[paqueta].filter(Boolean).length}`,
)
console.log('Sanity: matrix symmetric=true')
console.log('Built data/matrix.json; all sanity assertions passed')
