import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const stopwords = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'o',
  'a',
  'os',
  'as',
  'em',
  'no',
  'na',
  'nos',
  'nas',
])

const words = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .match(/[\p{L}\p{N}]+/gu) ?? []

const forbiddenNameWords = (name) =>
  new Set(words(name).filter((word) => !stopwords.has(word)))

const engenhoWords = forbiddenNameWords('Engenho de Dentro')
assert.equal(engenhoWords.has('de'), false, 'self-check: “de” must be allowed')
assert.equal(
  engenhoWords.has('engenho'),
  true,
  'self-check: “engenho” must be forbidden',
)
assert.equal(
  engenhoWords.has('dentro'),
  true,
  'self-check: “dentro” must be forbidden',
)
assert.equal(
  forbiddenNameWords('Freguesia (Ilha)').has('ilha'),
  true,
  'self-check: “ilha” must be forbidden',
)

const bairros = JSON.parse(
  readFileSync('data/bairros.geojson', 'utf8'),
).features
const hints = JSON.parse(readFileSync('data/hints.json', 'utf8'))
const tiers = ['region', 'character', 'giveaway']
const errors = []

for (const { properties } of bairros) {
  const entry = hints[properties.codbairro]
  if (!entry) {
    errors.push(`${properties.codbairro} ${properties.nome}: missing hints`)
    continue
  }

  const forbidden = forbiddenNameWords(properties.nome)
  for (const tier of tiers) {
    const hint = entry[tier]
    if (typeof hint !== 'string' || !hint.trim()) {
      errors.push(`${properties.codbairro} ${properties.nome}: missing ${tier}`)
      continue
    }
    if ([...hint].length > 140) {
      errors.push(
        `${properties.codbairro} ${properties.nome}: ${tier} exceeds 140 characters`,
      )
    }
    const leaked = words(hint).find((word) => forbidden.has(word))
    if (leaked) {
      errors.push(
        `${properties.codbairro} ${properties.nome}: ${tier} leaks “${leaked}”`,
      )
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(
    `Validated ${bairros.length} bairros with three leak-free hint tiers`,
  )
}
