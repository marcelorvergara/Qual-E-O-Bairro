import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  trackGameStart,
  trackGuess,
  trackHintUsed,
  trackShare,
  trackWin,
  type AnalyticsTransport,
} from './analytics'

function transport() {
  return vi.fn<AnalyticsTransport>()
}

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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('analytics event contract', () => {
  it('sends game_start with only the mode', () => {
    const send = transport()
    trackGameStart('daily', send)
    expect(send).toHaveBeenCalledWith('game_start', { mode: 'daily' })
  })

  it('sends daily guess parameters with exact names', () => {
    const send = transport()
    trackGuess('daily', 4, 12, send)
    expect(send).toHaveBeenCalledWith('guess', {
      mode: 'daily',
      guess_count: 4,
      puzzle_number: 12,
    })
  })

  it('omits puzzle_number from a practice guess', () => {
    const send = transport()
    trackGuess('practice', 2, 99, send)
    expect(send).toHaveBeenCalledWith('guess', {
      mode: 'practice',
      guess_count: 2,
    })
  })

  it('sends hint_used in both modes', () => {
    const send = transport()
    trackHintUsed('daily', 8, send)
    trackHintUsed('practice', undefined, send)
    expect(send).toHaveBeenNthCalledWith(1, 'hint_used', {
      mode: 'daily',
      puzzle_number: 8,
    })
    expect(send).toHaveBeenNthCalledWith(2, 'hint_used', {
      mode: 'practice',
    })
  })

  it('sends win with guess_count and mode-specific puzzle data', () => {
    const send = transport()
    trackWin('daily', 7, 3, send)
    trackWin('practice', 5, undefined, send)
    expect(send).toHaveBeenNthCalledWith(1, 'win', {
      mode: 'daily',
      guess_count: 7,
      puzzle_number: 3,
    })
    expect(send).toHaveBeenNthCalledWith(2, 'win', {
      mode: 'practice',
      guess_count: 5,
    })
  })

  it('sends share in both modes without a practice placeholder', () => {
    const send = transport()
    trackShare('daily', 15, send)
    trackShare('practice', undefined, send)
    expect(send).toHaveBeenNthCalledWith(1, 'share', {
      mode: 'daily',
      puzzle_number: 15,
    })
    expect(send).toHaveBeenNthCalledWith(2, 'share', {
      mode: 'practice',
    })
  })
})

describe('consent initialization', () => {
  it('queues denied defaults before applying stored acceptance', async () => {
    const dataLayer: unknown[][] = []
    const storage = new MemoryStorage()
    storage.setItem('qeb:consent:v1', 'granted')
    vi.stubGlobal('window', { dataLayer })
    vi.stubGlobal('localStorage', storage)
    const { initializeAnalytics } = await import('./analytics')

    initializeAnalytics()

    expect(dataLayer[0]).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      },
    ])
    expect(dataLayer[1]).toEqual([
      'consent',
      'update',
      {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      },
    ])
  })

  it('persists rejection and keeps every consent signal denied', async () => {
    const dataLayer: unknown[][] = []
    const storage = new MemoryStorage()
    vi.stubGlobal('window', { dataLayer })
    vi.stubGlobal('localStorage', storage)
    const { initializeAnalytics, setConsentChoice } =
      await import('./analytics')

    initializeAnalytics()
    setConsentChoice('denied')

    expect(storage.getItem('qeb:consent:v1')).toBe('denied')
    expect(dataLayer).toHaveLength(2)
    expect(dataLayer[1]).toEqual([
      'consent',
      'update',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      },
    ])
  })
})
