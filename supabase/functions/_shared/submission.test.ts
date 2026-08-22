import { expect, it } from 'vitest'
import { insertErrorCode, validateRecordedSubmission } from './submission'

const guesses = [
  { cod: 'B', created_at: '2026-08-22T12:00:00.000Z' },
  { cod: 'A', created_at: '2026-08-22T12:01:42.000Z' },
]

it('derives score and elapsed time from accepted server events', () => {
  expect(validateRecordedSubmission(guesses, 2, 'A')).toEqual({
    ok: true,
    score: 4,
    elapsedSeconds: 102,
  })
})

it.each([
  ['INCOMPLETE_GAME', [], 0, 'A'],
  ['INCOMPLETE_GAME', [guesses[0]], 0, 'A'],
  ['IMPOSSIBLE_SEQUENCE', [guesses[1], guesses[0]], 0, 'A'],
  [
    'IMPOSSIBLE_SEQUENCE',
    [
      { cod: 'B', created_at: 'not-a-date' },
      { cod: 'A', created_at: '2026-08-22T12:01:42.000Z' },
    ],
    0,
    'A',
  ],
])('rejects %s server-side', (code, attempts, hints, answer) => {
  expect(validateRecordedSubmission(attempts, hints, answer)).toEqual({
    ok: false,
    code,
  })
})

it('maps a unique conflict to the second-submission error', () => {
  expect(insertErrorCode(409)).toBe('ALREADY_SUBMITTED')
  expect(insertErrorCode(500)).toBeNull()
})
