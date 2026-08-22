const STATS_KEY = 'qeb:stats:v2'

export interface Stats {
  played: number
  currentStreak: number
  maxStreak: number
  lastWinPuzzle: number | null
  distribution: Record<number, number>
}

export function emptyStats(): Stats {
  return {
    played: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastWinPuzzle: null,
    distribution: {},
  }
}

function validInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function validStats(value: unknown): value is Stats {
  if (!value || typeof value !== 'object') return false
  const stats = value as Record<string, unknown>
  const distribution = stats.distribution
  return (
    validInteger(stats.played) &&
    validInteger(stats.currentStreak) &&
    validInteger(stats.maxStreak) &&
    (stats.lastWinPuzzle === null || validInteger(stats.lastWinPuzzle)) &&
    distribution !== null &&
    typeof distribution === 'object' &&
    !Array.isArray(distribution) &&
    Object.entries(distribution).every(
      ([score, count]) =>
        /^(?:[1-9]|10|11)$/.test(score) && validInteger(count),
    )
  )
}

export function loadStats(storage: Storage = localStorage): Stats {
  try {
    const parsed = JSON.parse(storage.getItem(STATS_KEY) ?? 'null')
    if (validStats(parsed)) return parsed
    storage.removeItem(STATS_KEY)
  } catch {
    try {
      storage.removeItem(STATS_KEY)
    } catch {
      // Storage can be unavailable in privacy modes.
    }
  }
  return emptyStats()
}

export function saveStats(stats: Stats, storage: Storage = localStorage) {
  try {
    storage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // Stats are optional when storage is unavailable.
  }
}

export function scoreBucket(score: number): number {
  return Math.min(Math.max(1, Math.floor(score)), 11)
}

export function recordWin(
  stats: Stats,
  puzzleNumber: number,
  score: number,
): Stats {
  if (stats.lastWinPuzzle === puzzleNumber) return stats
  const currentStreak =
    stats.lastWinPuzzle !== null && puzzleNumber === stats.lastWinPuzzle + 1
      ? stats.currentStreak + 1
      : 1
  const bucket = scoreBucket(score)
  return {
    played: stats.played + 1,
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastWinPuzzle: puzzleNumber,
    distribution: {
      ...stats.distribution,
      [bucket]: (stats.distribution[bucket] ?? 0) + 1,
    },
  }
}
