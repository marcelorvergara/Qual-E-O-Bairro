export interface RecordedGuess {
  cod: string
  created_at: string
}

export type SubmissionError = 'INCOMPLETE_GAME' | 'IMPOSSIBLE_SEQUENCE'

export function insertErrorCode(status: number): 'ALREADY_SUBMITTED' | null {
  return status === 409 ? 'ALREADY_SUBMITTED' : null
}

export function validateRecordedSubmission(
  guesses: RecordedGuess[],
  hints: number,
  answer: string,
):
  | { ok: true; score: number; elapsedSeconds: number }
  | { ok: false; code: SubmissionError } {
  if (guesses.slice(0, -1).some((guess) => guess.cod === answer))
    return { ok: false, code: 'IMPOSSIBLE_SEQUENCE' }
  if (guesses.length === 0 || guesses.at(-1)?.cod !== answer)
    return { ok: false, code: 'INCOMPLETE_GAME' }
  const first = Date.parse(guesses[0].created_at)
  const last = Date.parse(guesses.at(-1)!.created_at)
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first)
    return { ok: false, code: 'IMPOSSIBLE_SEQUENCE' }
  return {
    ok: true,
    score: guesses.length + hints,
    elapsedSeconds: Math.max(1, Math.floor((last - first) / 1000)),
  }
}
