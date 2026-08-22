import { dateInSaoPaulo } from '../_shared/daily-logic.ts'
import { validateNickname } from '../_shared/nickname.ts'
import {
  completeDailyResult,
  corsHeaders,
  dailyAnswer,
  dailyLeaderboard,
  error,
  json,
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
      const answer = await dailyAnswer(today)
      if (!answer) return error(request, 'PUZZLE_NOT_FOUND', 404)

      let nickname: string | null = null
      if (body.nickname !== undefined) {
        const nicknameValidation = validateNickname(body.nickname)
        if (!nicknameValidation.ok)
          return error(request, 'INVALID_NICKNAME', 400)
        nickname = nicknameValidation.value
      }
      const status = await completeDailyResult(
        today,
        body.deviceId,
        answer.cod,
        nickname,
      )
      if (status === 'already_submitted')
        return error(request, 'ALREADY_SUBMITTED', 409)
      if (status === 'rate_limited') return error(request, 'RATE_LIMITED', 429)
      if (status === 'incomplete_game')
        return error(request, 'INCOMPLETE_GAME', 400)
      if (status === 'impossible_sequence')
        return error(request, 'IMPOSSIBLE_SEQUENCE', 400)
      if (status !== 'accepted') return error(request, 'INTERNAL_ERROR', 500)
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
