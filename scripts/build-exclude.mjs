import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const features = JSON.parse(
  readFileSync('data/bairros.geojson', 'utf8'),
).features

function codeFor(name) {
  const feature = features.find(({ properties }) => properties.nome === name)
  assert.ok(feature, `Bairro not found: ${name}`)
  return feature.properties.codbairro
}

const argentino = codeFor('Argentino')
const paqueta = codeFor('Paquetá')

writeFileSync(
  'data/exclude.json',
  `${JSON.stringify({ todos: [argentino], daily: [argentino, paqueta] }, null, 2)}\n`,
)
console.log('Built data/exclude.json from bairro names')
