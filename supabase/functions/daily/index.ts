import bairros from '../_shared/data/bairros.json' with { type: 'json' }
import exclude from '../_shared/data/exclude.json' with { type: 'json' }
import hints from '../_shared/data/hints.json' with { type: 'json' }
import matrix from '../_shared/data/matrix.json' with { type: 'json' }
import {
  dateInSaoPaulo,
  hintText,
  matrixValue,
  puzzleNumberForDate,
  type Matrix,
} from '../_shared/daily-logic.ts'
import {
  consumeAction,
  corsHeaders,
  dailyAnswer,
  error,
  json,
  validDeviceId,
} from '../_shared/server.ts'

const gameMatrix = matrix as Matrix
const knownCodes = new Set(gameMatrix.codes)
const excludedCodes = new Set(exclude.todos)
const bairroByCode = new Map(bairros.map((bairro) => [bairro.cod, bairro]))

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }
  if (request.method !== 'POST')
    return error(request, 'METHOD_NOT_ALLOWED', 405)

  try {
    const body = (await request.json()) as Record<string, unknown>
    const today = dateInSaoPaulo()
    const answer = await dailyAnswer(today)
    if (!answer) return error(request, 'PUZZLE_NOT_FOUND', 404)

    if (body.action === 'bootstrap') {
      if (answer.puzzle_number !== puzzleNumberForDate(answer.puzzle_date)) {
        return error(request, 'PUZZLE_NUMBER_MISMATCH', 500)
      }
      return json(request, {
        puzzleNumber: answer.puzzle_number,
        puzzleDate: answer.puzzle_date,
        salt: answer.salt,
        answerHash: answer.answer_hash,
      })
    }
    if (body.action !== 'guess' && body.action !== 'hint') {
      return error(request, 'INVALID_ACTION', 400)
    }
    if (!validDeviceId(body.deviceId))
      return error(request, 'INVALID_DEVICE_ID', 400)

    if (body.action === 'guess') {
      if (typeof body.cod !== 'string' || !knownCodes.has(body.cod)) {
        return error(request, 'UNKNOWN_CODE', 400)
      }
      if (excludedCodes.has(body.cod))
        return error(request, 'EXCLUDED_CODE', 400)
      if (!(await consumeAction(today, body.deviceId, 'guess', 200))) {
        return error(request, 'RATE_LIMITED', 429)
      }
      const result = matrixValue(gameMatrix, body.cod, answer.cod)
      if (!result) throw new Error('Seeded answer is missing from matrix')
      const correct = body.cod === answer.cod
      return json(request, {
        ...result,
        correct,
        ...(correct ? { answer: bairroByCode.get(answer.cod) } : {}),
      })
    }

    const text = hintText(hints, answer.cod, body.tier)
    if (!text) return error(request, 'INVALID_HINT_TIER', 400)
    if (!(await consumeAction(today, body.deviceId, 'hint', 20))) {
      return error(request, 'RATE_LIMITED', 429)
    }
    return json(request, { text })
  } catch (caught) {
    console.error(caught)
    return error(request, 'INTERNAL_ERROR', 500)
  }
})
