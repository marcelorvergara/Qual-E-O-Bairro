import { adjacent, distance, hintsFor, poolFor } from './data'
import type { Oracle, PoolName } from './types'

export function practiceOracle(pool: PoolName, rng = Math.random): Oracle {
  const bairros = poolFor(pool)
  const answer = bairros[Math.floor(rng() * bairros.length)]
  const hints = hintsFor(answer.cod)
  const order = [hints.region, hints.character, hints.giveaway]

  return {
    mode: 'practice',
    async evaluate(cod) {
      const correct = cod === answer.cod
      return {
        km: distance(cod, answer.cod),
        adjacent: !correct && adjacent(cod, answer.cod),
        correct,
        ...(correct ? { answer } : {}),
      }
    },
    async hint(tier) {
      return order[tier - 1]
    },
  }
}
