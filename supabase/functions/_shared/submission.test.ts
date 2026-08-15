import { expect, it } from 'vitest'
import type { Matrix } from './daily-logic'
import {
  insertErrorCode,
  validateSubmission,
  type Submission,
} from './submission'

const matrix: Matrix = {
  codes: ['A', 'B', 'X'],
  km: [
    [0, 1, 2],
    [1, 0, 3],
    [2, 3, 0],
  ],
  adj: [
    [false, true, false],
    [true, false, false],
    [false, false, false],
  ],
}
const valid: Submission = {
  guesses: [
    { cod: 'B', km: 1, adjacent: true },
    { cod: 'A', km: 0, adjacent: false },
  ],
  hints: 1,
  elapsedSeconds: 30,
  score: 3,
}
const changed = (update: Partial<Submission>): Submission => ({
  ...valid,
  ...update,
})
const check = (submission: Submission, excluded = new Set<string>()) =>
  validateSubmission(submission, 'A', matrix, excluded)

it('accepts a valid sequence and computes its score', () => {
  expect(check(valid)).toEqual({ ok: true, score: 3 })
})

it.each([
  ['UNKNOWN_CODE', [{ cod: 'Z', km: 0, adjacent: false }], new Set<string>()],
  ['EXCLUDED_CODE', [{ cod: 'X', km: 2, adjacent: false }], new Set(['X'])],
  [
    'DUPLICATE_CODE',
    [valid.guesses[0], valid.guesses[0], valid.guesses[1]],
    new Set<string>(),
  ],
  [
    'MATRIX_MISMATCH',
    [{ cod: 'B', km: 9, adjacent: true }, valid.guesses[1]],
    new Set<string>(),
  ],
  [
    'ANSWER_BEFORE_FINAL',
    [valid.guesses[1], valid.guesses[0]],
    new Set<string>(),
  ],
  ['FINAL_ANSWER_INCORRECT', [valid.guesses[0]], new Set<string>()],
])('rejects %s', (code, guesses, excluded) => {
  expect(check(changed({ guesses }), excluded)).toEqual({ ok: false, code })
})

it.each([
  ['INVALID_HINTS', { hints: -1 }],
  ['INVALID_HINTS', { hints: 4 }],
  ['INVALID_ELAPSED_SECONDS', { elapsedSeconds: 0 }],
  ['INVALID_ELAPSED_SECONDS', { elapsedSeconds: 86_401 }],
  ['INVALID_SCORE', { score: 2 }],
])('rejects %s', (code, update) => {
  expect(check(changed(update))).toEqual({ ok: false, code })
})

it('maps a unique conflict to the second-submission error', () => {
  expect(insertErrorCode(409)).toBe('ALREADY_SUBMITTED')
  expect(insertErrorCode(500)).toBeNull()
})
