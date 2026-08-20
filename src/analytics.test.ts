import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  trackGameStart,
  trackGuess,
  trackHintUsed,
  trackShare,
  trackWin,
  trafficTypeParams,
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
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('analytics event contract', () => {
  it('marks game_start as internal outside production', () => {
    const send = transport()
    trackGameStart('daily', send)
    expect(send).toHaveBeenCalledWith('game_start', {
      mode: 'daily',
      traffic_type: 'internal',
    })
  })

  it('sends daily guess parameters with exact names', () => {
    const send = transport()
    trackGuess('daily', 4, 12, send)
    expect(send).toHaveBeenCalledWith('guess', {
      mode: 'daily',
      guess_count: 4,
      puzzle_number: 12,
      traffic_type: 'internal',
    })
  })

  it('omits puzzle_number from a practice guess', () => {
    const send = transport()
    trackGuess('practice', 2, 99, send)
    expect(send).toHaveBeenCalledWith('guess', {
      mode: 'practice',
      guess_count: 2,
      traffic_type: 'internal',
    })
  })

  it('sends hint_used in both modes', () => {
    const send = transport()
    trackHintUsed('daily', 8, send)
    trackHintUsed('practice', undefined, send)
    expect(send).toHaveBeenNthCalledWith(1, 'hint_used', {
      mode: 'daily',
      puzzle_number: 8,
      traffic_type: 'internal',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'hint_used', {
      mode: 'practice',
      traffic_type: 'internal',
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
      traffic_type: 'internal',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'win', {
      mode: 'practice',
      guess_count: 5,
      traffic_type: 'internal',
    })
  })

  it('sends share in both modes without a practice placeholder', () => {
    const send = transport()
    trackShare('daily', 15, send)
    trackShare('practice', undefined, send)
    expect(send).toHaveBeenNthCalledWith(1, 'share', {
      mode: 'daily',
      puzzle_number: 15,
      traffic_type: 'internal',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'share', {
      mode: 'practice',
      traffic_type: 'internal',
    })
  })

  it('reads the hostname at call time and omits traffic_type on production', () => {
    const send = transport()
    vi.stubGlobal('window', { location: { hostname: 'qualeobairro.com.br' } })

    trackGameStart('daily', send)
    window.location.hostname = 'preview.example.workers.dev'
    trackGameStart('practice', send)

    expect(send).toHaveBeenNthCalledWith(1, 'game_start', { mode: 'daily' })
    expect(send).toHaveBeenNthCalledWith(2, 'game_start', {
      mode: 'practice',
      traffic_type: 'internal',
    })
  })
})

describe('analytics traffic classification', () => {
  it('only treats the exact production hostname as external', () => {
    expect(trafficTypeParams('qualeobairro.com.br')).toEqual({})
    expect(trafficTypeParams('localhost')).toEqual({ traffic_type: 'internal' })
    expect(trafficTypeParams('127.0.0.1')).toEqual({ traffic_type: 'internal' })
    expect(trafficTypeParams('branch.qualeobairro.workers.dev')).toEqual({
      traffic_type: 'internal',
    })
    expect(trafficTypeParams('www.qualeobairro.com.br')).toEqual({
      traffic_type: 'internal',
    })
    expect(trafficTypeParams('example.com')).toEqual({
      traffic_type: 'internal',
    })
  })
})

describe('consent initialization', () => {
  it('marks the initial config as internal outside production', async () => {
    const dataLayer: (IArguments | unknown[])[] = []
    const storage = new MemoryStorage()
    storage.setItem('qeb:consent:v1', 'granted')
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST')
    vi.stubGlobal('window', {
      dataLayer,
      location: { hostname: 'preview.example.workers.dev' },
    })
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('document', {
      getElementById: () => null,
      createElement: () => ({}),
      head: { append: vi.fn() },
    })
    const { initializeAnalytics } = await import('./analytics')

    initializeAnalytics()

    expect(Array.from(dataLayer[3])).toEqual([
      'config',
      'G-TEST',
      { traffic_type: 'internal' },
    ])
  })

  it('omits traffic_type from the initial production config', async () => {
    const dataLayer: (IArguments | unknown[])[] = []
    const storage = new MemoryStorage()
    storage.setItem('qeb:consent:v1', 'granted')
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST')
    vi.stubGlobal('window', {
      dataLayer,
      location: { hostname: 'qualeobairro.com.br' },
    })
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('document', {
      getElementById: () => null,
      createElement: () => ({}),
      head: { append: vi.fn() },
    })
    const { initializeAnalytics } = await import('./analytics')

    initializeAnalytics()

    expect(Array.from(dataLayer[3])).toEqual(['config', 'G-TEST', {}])
  })

  it('queues canonical arguments objects rather than plain arrays', async () => {
    const dataLayer: (IArguments | unknown[])[] = []
    vi.stubGlobal('window', { dataLayer })
    vi.stubGlobal('localStorage', new MemoryStorage())
    const { initializeAnalytics } = await import('./analytics')

    initializeAnalytics()

    expect(Array.isArray(dataLayer[0])).toBe(false)
    expect(Object.prototype.toString.call(dataLayer[0])).toBe(
      '[object Arguments]',
    )
    expect(Array.from(dataLayer[0])).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      },
    ])
  })

  it('queues denied defaults before applying stored acceptance', async () => {
    const dataLayer: (IArguments | unknown[])[] = []
    const storage = new MemoryStorage()
    storage.setItem('qeb:consent:v1', 'granted')
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    vi.stubGlobal('window', { dataLayer })
    vi.stubGlobal('localStorage', storage)
    const { initializeAnalytics } = await import('./analytics')

    initializeAnalytics()

    expect(Array.from(dataLayer[0])).toEqual([
      'consent',
      'default',
      {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      },
    ])
    expect(Array.from(dataLayer[1])).toEqual([
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
    const dataLayer: (IArguments | unknown[])[] = []
    const storage = new MemoryStorage()
    vi.stubGlobal('window', { dataLayer })
    vi.stubGlobal('localStorage', storage)
    const { initializeAnalytics, setConsentChoice } =
      await import('./analytics')

    initializeAnalytics()
    setConsentChoice('denied')

    expect(storage.getItem('qeb:consent:v1')).toBe('denied')
    expect(dataLayer).toHaveLength(2)
    expect(Array.from(dataLayer[1])).toEqual([
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

  it('changes denied consent to granted after reopening preferences', async () => {
    const dataLayer: (IArguments | unknown[])[] = []
    const storage = new MemoryStorage()
    const append = vi.fn()
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST')
    vi.stubGlobal('window', {
      dataLayer,
      location: { hostname: 'qualeobairro.com.br' },
    })
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('document', {
      getElementById: () => null,
      createElement: () => ({}),
      head: { append },
    })
    const { getConsentChoice, initializeAnalytics, setConsentChoice } =
      await import('./analytics')

    initializeAnalytics()
    setConsentChoice('denied')
    expect(getConsentChoice()).toBe('denied')

    setConsentChoice('granted')

    expect(getConsentChoice()).toBe('granted')
    expect(storage.getItem('qeb:consent:v1')).toBe('granted')
    expect(Array.from(dataLayer[2])).toEqual([
      'consent',
      'update',
      {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted',
      },
    ])
    expect(append).toHaveBeenCalledOnce()
  })
})
