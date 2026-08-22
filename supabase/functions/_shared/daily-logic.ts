export const EPOCH_DATE = '2026-08-25'
export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'

export interface Matrix {
  codes: string[]
  km: number[][]
  adj: boolean[][]
}

export function dateInSaoPaulo(instant: Date | number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function puzzleNumberForDate(date: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date')
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.floor((parse(date) - parse(EPOCH_DATE)) / 86_400_000) + 1
}

export function matrixValue(matrix: Matrix, cod: string, answer: string) {
  const guessIndex = matrix.codes.indexOf(cod)
  const answerIndex = matrix.codes.indexOf(answer)
  if (guessIndex < 0 || answerIndex < 0) return null
  return {
    km: matrix.km[guessIndex][answerIndex],
    adjacent: matrix.adj[guessIndex][answerIndex],
  }
}

export function hintText(
  hints: Record<string, Record<string, string>>,
  cod: string,
  tier: unknown,
): string | null {
  if (tier !== 1 && tier !== 2 && tier !== 3) return null
  return hints[cod]?.[['region', 'character', 'giveaway'][tier - 1]] ?? null
}
