import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const target = 'supabase/functions/_shared/data'
mkdirSync(target, { recursive: true })

for (const name of ['matrix.json', 'hints.json', 'pool.json', 'exclude.json']) {
  copyFileSync(`data/${name}`, `${target}/${name}`)
}

const geojson = JSON.parse(readFileSync('data/bairros.geojson', 'utf8'))
const bairros = geojson.features
  .map(({ properties }) => ({
    cod: properties.codbairro,
    nome: properties.nome,
    rp: properties.rp,
  }))
  .sort((left, right) => left.cod.localeCompare(right.cod))

writeFileSync(`${target}/bairros.json`, `${JSON.stringify(bairros)}\n`)
console.log(`Built ${target} from generated data`)
