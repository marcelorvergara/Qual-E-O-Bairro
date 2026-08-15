import { readFileSync } from 'node:fs'

const bairros = JSON.parse(readFileSync('data/bairros.geojson', 'utf8')).features
const hints = JSON.parse(readFileSync('data/hints.json', 'utf8'))
const tiers = ['region', 'character', 'giveaway']
const errors = []

const words = (value) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .match(/[\p{L}\p{N}]+/gu) ?? []

for (const { properties } of bairros) {
  const entry = hints[properties.codbairro]
  if (!entry) {
    errors.push(`${properties.codbairro} ${properties.nome}: missing hints`)
    continue
  }

  const forbidden = new Set(words(properties.nome))
  for (const tier of tiers) {
    const hint = entry[tier]
    if (typeof hint !== 'string' || !hint.trim()) {
      errors.push(`${properties.codbairro} ${properties.nome}: missing ${tier}`)
      continue
    }
    if ([...hint].length > 140) {
      errors.push(`${properties.codbairro} ${properties.nome}: ${tier} exceeds 140 characters`)
    }
    const leaked = words(hint).find((word) => forbidden.has(word))
    if (leaked) {
      errors.push(`${properties.codbairro} ${properties.nome}: ${tier} leaks “${leaked}”`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Validated ${bairros.length} bairros with three leak-free hint tiers`)
}
