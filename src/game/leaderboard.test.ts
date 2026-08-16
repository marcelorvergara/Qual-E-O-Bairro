import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  partitionEntries,
  type LeaderboardEntry,
} from './leaderboard'

const entry = (position: number, isSelf = false): LeaderboardEntry => ({
  position,
  nickname: null,
  score: position,
  elapsedSeconds: 65,
  isSelf,
})

describe('leaderboard presentation', () => {
  it.each([
    [1, '0:01'],
    [65, '1:05'],
    [754, '12:34'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected)
  })

  it('keeps the player inline when inside the top 50', () => {
    expect(partitionEntries([entry(1), entry(8, true)])).toEqual({
      top: [entry(1), entry(8, true)],
      selfOutside: null,
    })
  })

  it('separates the player after the top 50 when outside it', () => {
    expect(partitionEntries([entry(1), entry(50), entry(87, true)])).toEqual({
      top: [entry(1), entry(50)],
      selfOutside: entry(87, true),
    })
  })
})
