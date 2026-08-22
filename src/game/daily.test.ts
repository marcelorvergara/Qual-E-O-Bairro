import { describe, expect, it } from 'vitest'
import {
  restoreProgress,
  restoreServerProgress,
  saveProgress,
  type DailyProgress,
} from './daily'
import { practiceShareText, shareText } from './share'
import type { Bucket } from './types'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() {
    return this.values.size
  }
  clear() {
    this.values.clear()
  }
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const guess = (bucket: Bucket, cod = '001') => ({
  cod,
  km: 1,
  adjacent: bucket === 'encosta',
  bucket,
})

describe('daily persistence', () => {
  it('keeps a local display cache without making it authoritative', () => {
    const storage = new MemoryStorage()
    const progress: DailyProgress = {
      puzzleNumber: 2,
      puzzleDate: '2026-08-16',
      guesses: [guess(2)],
      hints: ['Uma dica'],
      firstGuessAt: 123,
      submitted: false,
    }
    saveProgress(progress, storage)
    expect(restoreProgress(2, '2026-08-16', storage)).toMatchObject({
      progress,
      state: { guesses: progress.guesses, hintTexts: progress.hints },
    })
  })

  it('discards local display data at day rollover', () => {
    const storage = new MemoryStorage()
    saveProgress(
      {
        puzzleNumber: 2,
        puzzleDate: '2026-08-16',
        guesses: [],
        hints: [],
        firstGuessAt: null,
        submitted: false,
      },
      storage,
    )
    expect(restoreProgress(3, '2026-08-17', storage)).toBeNull()
  })

  it('does not restore development progress stored under v1', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'qeb:daily:v1',
      JSON.stringify({ puzzleDate: '2026-08-25' }),
    )
    expect(restoreProgress(1, '2026-08-25', storage)).toBeNull()
  })

  it('treats unavailable local storage as a non-fatal display-cache failure', () => {
    const unavailable = {
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError')
      },
    } as unknown as Storage
    expect(() =>
      saveProgress(
        {
          puzzleNumber: 2,
          puzzleDate: '2026-08-16',
          guesses: [],
          hints: [],
          firstGuessAt: null,
          submitted: false,
        },
        unavailable,
      ),
    ).not.toThrow()
  })

  it('hydrates only server-recorded guesses, hints, and win state', () => {
    const restored = restoreServerProgress({
      puzzleNumber: 2,
      puzzleDate: '2026-08-16',
      progress: {
        guesses: [
          {
            cod: '001',
            km: 0,
            adjacent: false,
            correct: true,
            answer: { cod: '001', nome: 'Saude', rp: 'RP 1' },
          },
        ],
        hints: ['Uma dica'],
        submitted: true,
      },
    })
    expect(restored.state.status).toBe('won')
    expect(restored.state.hintTexts).toEqual(['Uma dica'])
    expect(restored.progress.submitted).toBe(true)
  })
})

describe('share text', () => {
  it('omits a zero-hint clause', () => {
    expect(shareText(9, [guess(0)], 0)).toBe(
      'Qual é o Bairro? #9\n🎯 1 palpite\nhttps://qualeobairro.com.br',
    )
  })

  it('reproduces the canonical daily format', () => {
    const buckets: Bucket[] = [4, 3, 2, 1, 1, 1, 0]
    expect(
      shareText(
        123,
        buckets.map((bucket) => guess(bucket)),
        1,
      ),
    ).toBe(
      'Qual é o Bairro? #123\n🟥🟧🟨🟩🟩🟩🎯 7 palpites, 1 dica\nhttps://qualeobairro.com.br',
    )
  })

  it('formats practice without a puzzle number', () => {
    expect(practiceShareText([guess('encosta'), guess(0)], 2)).toBe(
      'Qual é o Bairro? — Prática\n🟪🎯 2 palpites, 2 dicas\nhttps://qualeobairro.com.br',
    )
  })
})
