import * as api from '../api/daily'
import { allBairros } from './data'
import { newGame } from './reducer'
import type { Bairro, GameState, Oracle } from './types'

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

export function dailyOracle(id: string): Oracle {
  return {
    mode: 'daily',
    evaluate: (cod) => api.guess(id, cod),
    hint: (tier) => api.hint(id, tier),
  }
}

export function saveProgress(
  value: DailyProgress,
  storage: Storage = localStorage,
) {
  storage.setItem(DAILY_KEY, JSON.stringify(value))
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

export async function verifyAnswer(
  salt: string,
  cod: string,
  expected: string,
): Promise<boolean> {
  const bytes = new TextEncoder().encode(salt + cod)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return (
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('') === expected.toLowerCase()
  )
}
