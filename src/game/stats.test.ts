import { describe, expect, it } from 'vitest'
import { emptyStats, loadStats, recordWin, saveStats } from './stats'

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

describe('daily stats', () => {
  it('records a first win', () => {
    expect(recordWin(emptyStats(), 7, 3)).toEqual({
      played: 1,
      currentStreak: 1,
      maxStreak: 1,
      lastWinPuzzle: 7,
      distribution: { 3: 1 },
    })
  })

  it('increments consecutive streaks and preserves the maximum after a gap', () => {
    const first = recordWin(emptyStats(), 7, 2)
    const second = recordWin(first, 8, 4)
    const gap = recordWin(second, 11, 5)
    expect(second).toMatchObject({ currentStreak: 2, maxStreak: 2 })
    expect(gap).toMatchObject({
      played: 3,
      currentStreak: 1,
      maxStreak: 2,
      lastWinPuzzle: 11,
    })
  })

  it('records the same puzzle only once', () => {
    const first = recordWin(emptyStats(), 7, 2)
    expect(recordWin(first, 7, 9)).toBe(first)
  })

  it('buckets every score above 10 under 11', () => {
    const first = recordWin(emptyStats(), 7, 11)
    const second = recordWin(first, 8, 28)
    expect(second.distribution).toEqual({ 11: 2 })
  })

  it('round-trips and remains idempotent after a refresh', () => {
    const storage = new MemoryStorage()
    saveStats(recordWin(emptyStats(), 7, 3), storage)
    const restored = loadStats(storage)
    const revisited = recordWin(restored, 7, 3)
    expect(revisited).toEqual(restored)
    expect(revisited.played).toBe(1)
  })

  it.each(['{bad json', '{"played":"many"}', 'null'])(
    'resets corrupt storage: %s',
    (value) => {
      const storage = new MemoryStorage()
      storage.setItem('qeb:stats:v1', value)
      expect(loadStats(storage)).toEqual(emptyStats())
      expect(storage.length).toBe(0)
    },
  )
})
