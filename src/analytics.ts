export type GameMode = 'daily' | 'practice'
export type ConsentChoice = 'granted' | 'denied' | null

type EventName = 'game_start' | 'guess' | 'hint_used' | 'win' | 'share'
type EventParams = {
  mode: GameMode
  guess_count?: number
  puzzle_number?: number
  traffic_type?: 'internal'
}

export type AnalyticsTransport = (name: EventName, params: EventParams) => void

declare global {
  interface Window {
    dataLayer?: (IArguments | unknown[])[]
    gtag?: (...args: unknown[]) => void
  }
}

const CONSENT_KEY = 'qeb:consent:v1'
const SCRIPT_ID = 'qeb-ga4'
const PRODUCTION_HOST = 'qualeobairro.com.br'
const denied = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
} as const
const granted = {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
} as const

let initialized = false
let currentConsent: ConsentChoice = null

function measurementId() {
  return import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? ''
}

export function trafficTypeParams(hostname: string): {
  traffic_type?: 'internal'
} {
  return hostname.toLowerCase() === PRODUCTION_HOST
    ? {}
    : { traffic_type: 'internal' }
}

function currentTrafficTypeParams() {
  return trafficTypeParams(
    typeof window === 'undefined' ? '' : window.location.hostname,
  )
}

function storedConsent(): ConsentChoice {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

function ensureGtag() {
  window.dataLayer ??= []
  // gtag.js recognizes queued commands by their Arguments object shape.
  window.gtag ??= function () {
    // eslint-disable-next-line prefer-rest-params -- A rest array is ignored by gtag.js.
    window.dataLayer?.push(arguments)
  }
  return window.gtag
}

function loadGtag() {
  const id = measurementId()
  if (!id || document.getElementById(SCRIPT_ID)) return
  const gtag = ensureGtag()
  gtag('js', new Date())
  gtag('config', id, {
    ...currentTrafficTypeParams(),
  })
  const script = document.createElement('script')
  script.async = true
  script.id = SCRIPT_ID
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.append(script)
}

export function initializeAnalytics() {
  if (initialized) return
  initialized = true
  const gtag = ensureGtag()
  gtag('consent', 'default', denied)
  currentConsent = storedConsent()
  if (currentConsent) {
    gtag('consent', 'update', currentConsent === 'granted' ? granted : denied)
  }
  if (currentConsent === 'granted') loadGtag()
}

export function getConsentChoice(): ConsentChoice {
  return currentConsent ?? storedConsent()
}

export function setConsentChoice(choice: Exclude<ConsentChoice, null>) {
  initializeAnalytics()
  currentConsent = choice
  try {
    localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    // Consent still applies for this page when storage is unavailable.
  }
  ensureGtag()('consent', 'update', choice === 'granted' ? granted : denied)
  if (choice === 'granted') loadGtag()
}

const browserTransport: AnalyticsTransport = (name, params) => {
  if (currentConsent !== 'granted' || !measurementId()) return
  window.gtag?.('event', name, params)
}

function puzzleParams(mode: GameMode, puzzleNumber?: number) {
  return {
    mode,
    ...(mode === 'daily' && puzzleNumber !== undefined
      ? { puzzle_number: puzzleNumber }
      : {}),
    ...currentTrafficTypeParams(),
  }
}

export function trackGameStart(mode: GameMode, transport = browserTransport) {
  transport('game_start', { mode, ...currentTrafficTypeParams() })
}

export function trackGuess(
  mode: GameMode,
  guessCount: number,
  puzzleNumber?: number,
  transport = browserTransport,
) {
  transport('guess', {
    ...puzzleParams(mode, puzzleNumber),
    guess_count: guessCount,
  })
}

export function trackHintUsed(
  mode: GameMode,
  puzzleNumber?: number,
  transport = browserTransport,
) {
  transport('hint_used', puzzleParams(mode, puzzleNumber))
}

export function trackWin(
  mode: GameMode,
  guessCount: number,
  puzzleNumber?: number,
  transport = browserTransport,
) {
  transport('win', {
    ...puzzleParams(mode, puzzleNumber),
    guess_count: guessCount,
  })
}

export function trackShare(
  mode: GameMode,
  puzzleNumber?: number,
  transport = browserTransport,
) {
  transport('share', puzzleParams(mode, puzzleNumber))
}
