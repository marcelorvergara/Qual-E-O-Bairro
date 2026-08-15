import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve('data/raw/Limite_de_Bairros.geojson')
const output = resolve('data/bairros.geojson')
const executable = process.execPath
const mapshaperCli = resolve('node_modules/mapshaper/bin/mapshaper')

execFileSync(
  executable,
  [
    mapshaperCli,
    input,
    '-simplify',
    '6%',
    'keep-shapes',
    '-filter-fields',
    'codbairro,nome,rp,regiao_adm',
    '-each',
    'rp=rp.trim(),regiao_adm=regiao_adm.trim()',
    '-o',
    `precision=0.0001`,
    'format=geojson',
    output,
  ],
  { stdio: 'inherit' },
)

const geojson = JSON.parse(readFileSync(output, 'utf8'))
const countVertices = (coordinates) =>
  typeof coordinates[0] === 'number'
    ? 1
    : coordinates.reduce((sum, item) => sum + countVertices(item), 0)

const vertices = geojson.features.reduce(
  (sum, feature) => sum + countVertices(feature.geometry.coordinates),
  0,
)
const bytes = statSync(output).size

console.log(
  `Built data/bairros.geojson: ${geojson.features.length} features, ${vertices} vertices, ${(bytes / 1024).toFixed(1)} KB`,
)

if (geojson.features.length !== 166) {
  throw new Error(`Expected 166 bairros, found ${geojson.features.length}`)
}
