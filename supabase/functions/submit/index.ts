import exclude from '../_shared/data/exclude.json' with { type: 'json' }
import matrix from '../_shared/data/matrix.json' with { type: 'json' }
import { type Matrix } from '../_shared/daily-logic.ts'
import { validateNickname } from '../_shared/nickname.ts'
import {
  type Submission,
  insertErrorCode,
  validateSubmission,
} from '../_shared/submission.ts'
import {
  corsHeaders,
  dailyAnswer,
  dailyLeaderboard,
  error,
  json,
  serviceRequest,
  validDeviceId,
} from '../_shared/server.ts'

const gameMatrix = matrix as Matrix

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }
  if (request.method !== 'POST')
    return error(request, 'METHOD_NOT_ALLOWED', 405)

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.puzzleDate !== 'string') {
      return error(request, 'INVALID_PUZZLE_DATE', 400)
    }
    if (!validDeviceId(body.deviceId))
      return error(request, 'INVALID_DEVICE_ID', 400)
    if (!Array.isArray(body.guesses)) return error(request, 'UNKNOWN_CODE', 400)

    const answer = await dailyAnswer(body.puzzleDate)
    if (!answer) return error(request, 'PUZZLE_NOT_FOUND', 404)
    const submission = body as unknown as Submission
    const validation = validateSubmission(
      submission,
      answer.cod,
      gameMatrix,
      new Set(exclude.todos),
    )
    if (!validation.ok) return error(request, validation.code, 400)

    let nickname: string | null = null
    if (body.nickname !== undefined) {
      const nicknameValidation = validateNickname(body.nickname)
      if (!nicknameValidation.ok) return error(request, 'INVALID_NICKNAME', 400)
      nickname = nicknameValidation.value
    }
    const response = await serviceRequest('daily_results', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        puzzle_date: answer.puzzle_date,
        device_id: body.deviceId,
        nickname,
        guesses: submission.guesses.length,
        hints: submission.hints,
        score: validation.score,
        elapsed_seconds: submission.elapsedSeconds,
        guess_codes: submission.guesses.map(({ cod }) => cod),
      }),
    })
    const insertCode = insertErrorCode(response.status)
    if (insertCode) return error(request, insertCode, 409)
    if (!response.ok)
      throw new Error(`Result insert failed: ${response.status}`)
    try {
      const leaderboard = await dailyLeaderboard(
        answer.puzzle_date,
        body.deviceId,
      )
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
})
