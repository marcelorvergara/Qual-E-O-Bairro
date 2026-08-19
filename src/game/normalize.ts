import type { Bairro } from './types'

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[()]/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ')
}

export function exactBairroMatch(
  normalizedQuery: string,
  bairros: Bairro[],
): Bairro | null {
  let exactMatch: Bairro | null = null

  for (const bairro of bairros) {
    if (normalizeName(bairro.nome) !== normalizedQuery) continue
    if (exactMatch) return null
    exactMatch = bairro
  }

  return exactMatch
}

export function matchBairros(
  query: string,
  bairros: Bairro[],
  limit = 6,
): Bairro[] {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return []

  return bairros
    .map((bairro) => ({ bairro, name: normalizeName(bairro.nome) }))
    .filter(
      ({ name }) =>
        name.startsWith(normalizedQuery) ||
        name
          .split(' ')
          .some((_, index, words) =>
            words.slice(index).join(' ').startsWith(normalizedQuery),
          ),
    )
    .sort(
      (a, b) =>
        Number(b.name.startsWith(normalizedQuery)) -
          Number(a.name.startsWith(normalizedQuery)) ||
        a.bairro.nome.localeCompare(b.bairro.nome, 'pt-BR'),
    )
    .slice(0, limit)
    .map(({ bairro }) => bairro)
}
