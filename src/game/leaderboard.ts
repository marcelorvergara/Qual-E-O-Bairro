export interface LeaderboardEntry {
  position: number
  nickname: string | null
  score: number
  elapsedSeconds: number
  isSelf: boolean
}

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function partitionEntries(entries: LeaderboardEntry[]): {
  top: LeaderboardEntry[]
  selfOutside: LeaderboardEntry | null
} {
  return {
    top: entries.filter(({ position }) => position <= 50),
    selfOutside:
      entries.find(({ position, isSelf }) => position > 50 && isSelf) ?? null,
  }
}
