import { bucketFor } from './buckets'
import type { Evaluation, GameState, HintCount, PoolName } from './types'

export function newGame(pool: PoolName): GameState {
  return {
    answer: null,
    guesses: [],
    status: 'playing',
    pool,
    hintsUsed: 0,
    hintTexts: [],
    pending: false,
    error: null,
  }
}

export function beginRequest(state: GameState): GameState {
  return state.pending ? state : { ...state, pending: true, error: null }
}

export function resolveGuess(
  state: GameState,
  cod: string,
  result: Evaluation,
): GameState {
  if (
    state.status === 'won' ||
    state.guesses.some((previous) => previous.cod === cod)
  ) {
    return { ...state, pending: false }
  }

  const bucket = bucketFor(result.km, result.adjacent, result.correct)
  return {
    ...state,
    answer: result.correct ? (result.answer ?? null) : state.answer,
    guesses: [
      ...state.guesses,
      { cod, km: result.km, adjacent: result.adjacent, bucket },
    ],
    status: result.correct ? 'won' : 'playing',
    pending: false,
    error: null,
  }
}

export function failRequest(state: GameState, message: string): GameState {
  return { ...state, pending: false, error: message }
}

export function guessCount(state: GameState): number {
  return state.guesses.length
}

export function resolveHint(state: GameState, text: string): GameState {
  if (state.status === 'won' || state.hintsUsed === 3) {
    return { ...state, pending: false }
  }
  return {
    ...state,
    hintsUsed: (state.hintsUsed + 1) as HintCount,
    hintTexts: [...state.hintTexts, text],
    pending: false,
    error: null,
  }
}

export function score(state: GameState): number {
  return state.guesses.length + state.hintsUsed
}
