import type { Bucket } from './types'

export function bucketFor(
  km: number,
  isAdjacent: boolean,
  isCorrect: boolean,
): Bucket {
  if (isCorrect) return 0
  if (isAdjacent) return 'encosta'
  if (km <= 3) return 1
  if (km <= 7) return 2
  if (km <= 12) return 3
  if (km <= 20) return 4
  return 5
}
