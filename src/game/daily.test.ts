import { describe, expect, it } from 'vitest'
import {
  restoreProgress,
  restoreVerifiedProgress,
  saveProgress,
  type DailyProgress,
} from './daily'
import type { Bucket } from './types'
import { shareText } from './share'

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
  it('round-trips progress without evaluating guesses or hints', () => {
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

  it('discards progress at the day rollover', () => {
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
    expect(storage.length).toBe(0)
  })

  it('discards a restored win that fails hash verification', async () => {
    const storage = new MemoryStorage()
    saveProgress(
      {
        puzzleNumber: 2,
        puzzleDate: '2026-08-16',
        guesses: [guess(0)],
        hints: [],
        firstGuessAt: 123,
        submitted: false,
        answer: { cod: '001', nome: 'Saúde', rp: 'RP 1' },
      },
      storage,
    )
    expect(
      await restoreVerifiedProgress(
        2,
        '2026-08-16',
        'salt',
        'invalid',
        storage,
      ),
    ).toBeNull()
    expect(storage.length).toBe(0)
  })
})

describe('share text', () => {
  it('omits a zero-hint clause', () => {
    expect(shareText(9, [guess(0)], 0)).toContain('🎯 1 palpite\n')
  })
  it('pluralizes one hint and maps encosta', () => {
    expect(shareText(9, [guess('encosta'), guess(0)], 1)).toContain(
      '🟪🎯 2 palpites, 1 dica',
    )
  })

  it('localizes shared results in English', () => {
    expect(shareText(9, [guess(0)], 1, 'en')).toContain('🎯 1 guess, 1 hint')
  })
  it('reproduces the plan example', () => {
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
})
