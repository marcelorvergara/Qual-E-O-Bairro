import { dateInSaoPaulo } from '../_shared/daily-logic.ts'
import { validateNickname } from '../_shared/nickname.ts'
import {
  insertErrorCode,
  validateRecordedSubmission,
} from '../_shared/submission.ts'
import {
  consumeAction,
  corsHeaders,
  dailyAnswer,
  dailyGuesses,
  dailyHints,
  dailyLeaderboard,
  error,
  json,
  serviceRequest,
  validDeviceId,
} from '../_shared/server.ts'

export function createSubmitHandler() {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    if (request.method !== 'POST')
      return error(request, 'METHOD_NOT_ALLOWED', 405)

    try {
      const body = (await request.json()) as Record<string, unknown>
      const today = dateInSaoPaulo()
      if (body.puzzleDate !== today) return error(request, 'NOT_TODAY', 400)
      if (!validDeviceId(body.deviceId))
        return error(request, 'INVALID_DEVICE_ID', 400)
      if (!(await consumeAction(today, body.deviceId, 'submit', 10)))
        return error(request, 'RATE_LIMITED', 429)

      const answer = await dailyAnswer(today)
      if (!answer) return error(request, 'PUZZLE_NOT_FOUND', 404)
      const [guesses, hints] = await Promise.all([
        dailyGuesses(today, body.deviceId),
        dailyHints(today, body.deviceId),
      ])
      const validation = validateRecordedSubmission(
        guesses,
        hints.length,
        answer.cod,
      )
      if (!validation.ok) return error(request, validation.code, 400)

      let nickname: string | null = null
      if (body.nickname !== undefined) {
        const nicknameValidation = validateNickname(body.nickname)
        if (!nicknameValidation.ok)
          return error(request, 'INVALID_NICKNAME', 400)
        nickname = nicknameValidation.value
      }
      const response = await serviceRequest('daily_results', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({
          puzzle_date: today,
          device_id: body.deviceId,
          nickname,
          guesses: guesses.length,
          hints: hints.length,
          score: validation.score,
          elapsed_seconds: validation.elapsedSeconds,
          guess_codes: guesses.map(({ cod }) => cod),
        }),
      })
      const insertCode = insertErrorCode(response.status)
      if (insertCode) return error(request, insertCode, 409)
      if (!response.ok)
        throw new Error(`Result insert failed: ${response.status}`)
      try {
        const leaderboard = await dailyLeaderboard(today, body.deviceId)
        const own = leaderboard.entries.find((entry) => entry.is_self)
        return json(request, {
          ok: true,
          ...(own ? { position: own.position, total: leaderboard.total } : {}),
        })
      } catch (caught) {
        console.error('Result inserted but rank lookup failed', caught)
        return json(request, { ok: true })
      }
    } catch (caught) {
      console.error(caught)
      return error(request, 'INTERNAL_ERROR', 500)
    }
  }
}

Deno.serve(createSubmitHandler())
