import bairrosJson from '../../data/bairros.geojson'
import excludeJson from '../../data/exclude.json'
import hintsJson from '../../data/hints.json'
import matrixJson from '../../data/matrix.json'
import poolJson from '../../data/pool.json'
import type { Bairro, Hints, PoolName } from './types'

interface Matrix {
  codes: string[]
  km: number[][]
  adj: boolean[][]
}

interface BairroFeature {
  properties: { codbairro: string; nome: string; rp: string }
}

const features = (bairrosJson as { features: BairroFeature[] }).features
const matrix = matrixJson as Matrix
const indexes = new Map(matrix.codes.map((cod, index) => [cod, index]))

export const allBairros: Bairro[] = features.map(({ properties }) => ({
  cod: properties.codbairro,
  nome: properties.nome,
  rp: properties.rp,
}))

const byCode = new Map(allBairros.map((bairro) => [bairro.cod, bairro]))
const hintsByCode = hintsJson as Record<string, Hints>

export const HINT_ORDER = ['region', 'character', 'giveaway'] as const

export function hintsFor(cod: string): Hints {
  const hints = hintsByCode[cod]
  if (!hints) throw new Error(`Dicas não encontradas: ${cod}`)
  return hints
}

export function poolFor(pool: PoolName): Bairro[] {
  const codes =
    pool === 'conhecidos'
      ? new Set(poolJson.codes)
      : new Set(allBairros.map(({ cod }) => cod))
  if (pool === 'todos') {
    for (const cod of excludeJson.todos) codes.delete(cod)
  }
  return [...codes].map((cod) => byCode.get(cod)).filter(Boolean) as Bairro[]
}

function pair(a: string, b: string): [number, number] {
  const first = indexes.get(a)
  const second = indexes.get(b)
  if (first === undefined || second === undefined) {
    throw new Error(`Código de bairro desconhecido: ${a}, ${b}`)
  }
  return [first, second]
}

export function distance(a: string, b: string): number {
  const [first, second] = pair(a, b)
  return matrix.km[first][second]
}

export function adjacent(a: string, b: string): boolean {
  const [first, second] = pair(a, b)
  return matrix.adj[first][second]
}
