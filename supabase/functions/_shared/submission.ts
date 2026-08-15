import { matrixValue, type Matrix } from './daily-logic.ts'

export interface Submission {
  guesses: { cod: string; km: number; adjacent: boolean }[]
  hints: unknown
  elapsedSeconds: unknown
  score?: unknown
}

export type SubmissionError =
  | 'UNKNOWN_CODE'
  | 'EXCLUDED_CODE'
  | 'DUPLICATE_CODE'
  | 'MATRIX_MISMATCH'
  | 'ANSWER_BEFORE_FINAL'
  | 'FINAL_ANSWER_INCORRECT'
  | 'INVALID_HINTS'
  | 'INVALID_ELAPSED_SECONDS'
  | 'INVALID_SCORE'

export function insertErrorCode(status: number): 'ALREADY_SUBMITTED' | null {
  return status === 409 ? 'ALREADY_SUBMITTED' : null
}

export function validateSubmission(
  submission: Submission,
  answer: string,
  matrix: Matrix,
  excluded: ReadonlySet<string>,
): { ok: true; score: number } | { ok: false; code: SubmissionError } {
  const known = new Set(matrix.codes)
  for (const guess of submission.guesses) {
    if (!known.has(guess.cod)) return { ok: false, code: 'UNKNOWN_CODE' }
    if (excluded.has(guess.cod)) return { ok: false, code: 'EXCLUDED_CODE' }
  }
  const codes = submission.guesses.map(({ cod }) => cod)
  if (new Set(codes).size !== codes.length)
    return { ok: false, code: 'DUPLICATE_CODE' }
  for (const guess of submission.guesses) {
    const expected = matrixValue(matrix, guess.cod, answer)
    if (
      !expected ||
      guess.km !== expected.km ||
      guess.adjacent !== expected.adjacent
    ) {
      return { ok: false, code: 'MATRIX_MISMATCH' }
    }
  }
  if (codes.slice(0, -1).includes(answer))
    return { ok: false, code: 'ANSWER_BEFORE_FINAL' }
  if (codes.at(-1) !== answer)
    return { ok: false, code: 'FINAL_ANSWER_INCORRECT' }
  if (
    !Number.isInteger(submission.hints) ||
    Number(submission.hints) < 0 ||
    Number(submission.hints) > 3
  ) {
    return { ok: false, code: 'INVALID_HINTS' }
  }
  const elapsed = Number(submission.elapsedSeconds)
  if (!Number.isInteger(elapsed) || elapsed <= 0 || elapsed > 86_400) {
    return { ok: false, code: 'INVALID_ELAPSED_SECONDS' }
  }
  const score = codes.length + Number(submission.hints)
  if (submission.score !== undefined && submission.score !== score) {
    return { ok: false, code: 'INVALID_SCORE' }
  }
  return { ok: true, score }
}
