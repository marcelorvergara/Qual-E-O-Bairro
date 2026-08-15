import { bucketFor } from './buckets'
import { adjacent, distance, poolFor } from './data'
import type { GameState, PoolName } from './types'

export function newGame(pool: PoolName, rng = Math.random): GameState {
  const bairros = poolFor(pool)
  const answer = bairros[Math.floor(rng() * bairros.length)]
  return { answer, guesses: [], status: 'playing', pool }
}

export function guess(state: GameState, cod: string): GameState {
  if (
    state.status === 'won' ||
    state.guesses.some((previous) => previous.cod === cod)
  ) {
    return state
  }

  const won = cod === state.answer.cod
  const km = distance(cod, state.answer.cod)
  const isAdjacent = !won && adjacent(cod, state.answer.cod)
  const bucket = bucketFor(km, isAdjacent, won)
  return {
    ...state,
    guesses: [...state.guesses, { cod, km, adjacent: isAdjacent, bucket }],
    status: won ? 'won' : 'playing',
  }
}

export function reset(state: GameState, rng = Math.random): GameState {
  return newGame(state.pool, rng)
}

export function guessCount(state: GameState): number {
  return state.guesses.length
}
