import * as api from '../api/daily'
import { allBairros } from './data'
import { newGame, resolveGuess, resolveHint } from './reducer'
import type { Bairro, Evaluation, GameState, Oracle } from './types'

const DEVICE_KEY = 'qeb:device:v1'
const DAILY_KEY = 'qeb:daily:v1'

export interface DailyProgress {
  puzzleNumber: number
  puzzleDate: string
  guesses: GameState['guesses']
  hints: string[]
  firstGuessAt: number | null
  submitted: boolean
  answer?: Bairro
}

export function deviceId(storage: Storage = localStorage): string {
  const stored = storage.getItem(DEVICE_KEY)
  if (stored) return stored
  const created = crypto.randomUUID()
  storage.setItem(DEVICE_KEY, created)
  return created
}

export function dailyOracle(id: string, puzzleDate: string): Oracle {
  return {
    mode: 'daily',
    evaluate: (cod) => api.guess(id, puzzleDate, cod),
    hint: (tier) => api.hint(id, puzzleDate, tier),
  }
}

export function saveProgress(
  value: DailyProgress,
  storage: Storage = localStorage,
) {
  try {
    storage.setItem(DAILY_KEY, JSON.stringify(value))
  } catch {
    // The server remains authoritative when local storage is unavailable.
  }
}

export function restoreProgress(
  puzzleNumber: number,
  puzzleDate: string,
  storage: Storage = localStorage,
): { state: GameState; progress: DailyProgress } | null {
  try {
    const value = JSON.parse(
      storage.getItem(DAILY_KEY) ?? 'null',
    ) as DailyProgress
    if (!value || value.puzzleDate !== puzzleDate) {
      storage.removeItem(DAILY_KEY)
      return null
    }
    const answer = value.answer
      ? (allBairros.find(({ cod }) => cod === value.answer?.cod) ??
        value.answer)
      : null
    return {
      progress: { ...value, puzzleNumber },
      state: {
        ...newGame('conhecidos'),
        answer,
        guesses: value.guesses,
        status: answer ? 'won' : 'playing',
        hintsUsed: Math.min(value.hints.length, 3) as GameState['hintsUsed'],
        hintTexts: value.hints,
      },
    }
  } catch {
    storage.removeItem(DAILY_KEY)
    return null
  }
}

export function restoreServerProgress(meta: api.Bootstrap): {
  state: GameState
  progress: DailyProgress
} {
  let state = newGame('conhecidos')
  for (const hint of meta.progress.hints) state = resolveHint(state, hint)
  for (const guess of meta.progress.guesses) {
    const { cod, ...evaluation } = guess
    state = resolveGuess(state, cod, evaluation as Evaluation)
  }
  return {
    state,
    progress: {
      puzzleNumber: meta.puzzleNumber,
      puzzleDate: meta.puzzleDate,
      guesses: state.guesses,
      hints: state.hintTexts,
      firstGuessAt: null,
      submitted: meta.progress.submitted,
      answer: state.answer ?? undefined,
    },
  }
}
