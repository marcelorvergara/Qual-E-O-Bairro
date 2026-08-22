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
  dailyGuesses,
  dailyHints,
  dailyLeaderboard,
  error,
  json,
  recordDailyGuess,
  recordDailyHint,
  serviceRequest,
  validDeviceId,
} from '../_shared/server.ts'
import { validateNickname } from '../_shared/nickname.ts'
import { fitExplainer } from '../_shared/explainer.ts'

const gameMatrix = matrix as Matrix
const knownCodes = new Set(gameMatrix.codes)
const excludedCodes = new Set(exclude.todos)
const bairroByCode = new Map(bairros.map((bairro) => [bairro.cod, bairro]))

interface ExplainerRow {
  body: string
}

function actionError(request: Request, status: string): Response | null {
  if (status === 'accepted') return null
  if (status === 'rate_limited') return error(request, 'RATE_LIMITED', 429)
  if (status === 'duplicate_guess')
    return error(request, 'DUPLICATE_GUESS', 409)
  if (status === 'game_complete') return error(request, 'GAME_COMPLETE', 409)
  if (status === 'invalid_hint_tier')
    return error(request, 'INVALID_HINT_TIER', 400)
  return error(request, 'INTERNAL_ERROR', 500)
}

async function resultExists(date: string, deviceId: string): Promise<boolean> {
  const response = await serviceRequest(
    `daily_results?puzzle_date=eq.${encodeURIComponent(date)}&device_id=eq.${encodeURIComponent(deviceId)}&select=id&limit=1`,
  )
  if (!response.ok) throw new Error(`Result query failed: ${response.status}`)
  return ((await response.json()) as { id: string }[]).length > 0
}

async function cachedExplainer(cod: string): Promise<string | null> {
  const response = await serviceRequest(
    `bairro_explainers?cod=eq.${encodeURIComponent(cod)}&lang=eq.pt-BR&select=body&limit=1`,
  )
  if (!response.ok)
    throw new Error(`Explainer query failed: ${response.status}`)
  const rows = (await response.json()) as ExplainerRow[]
  return rows[0]?.body ?? null
}

async function generateExplainer(nome: string): Promise<string | null> {
  if (Deno.env.get('EXPLAINER_ENABLED') !== 'true') return null
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: `Em português do Brasil, escreva duas ou três frases factuais, com no máximo 400 caracteres no total, sobre o que o bairro ${JSON.stringify(nome)}, no município do Rio de Janeiro, é conhecido. Responda apenas com o texto, sem título ou markdown.`,
          },
        ],
      }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as {
      content?: { type?: string; text?: string }[]
    }
    const body = payload.content?.find((block) => block.type === 'text')?.text
    return typeof body === 'string' ? fitExplainer(body) : null
  } catch (caught) {
    console.error('Explainer generation failed', caught)
    return null
  }
}

async function explainerFor(cod: string, nome: string): Promise<string | null> {
  const cached = await cachedExplainer(cod)
  if (cached) return cached
  const generated = await generateExplainer(nome)
  if (!generated) return null
  try {
    const response = await serviceRequest(
      'bairro_explainers?on_conflict=cod,lang',
      {
        method: 'POST',
        headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ cod, lang: 'pt-BR', body: generated }),
      },
    )
    if (!response.ok)
      throw new Error(`Explainer insert failed: ${response.status}`)
    return await cachedExplainer(cod)
  } catch (caught) {
    console.error('Explainer cache write failed', caught)
    return null
  }
}

export function createDailyHandler() {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    if (request.method !== 'POST')
      return error(request, 'METHOD_NOT_ALLOWED', 405)

    try {
      const body = (await request.json()) as Record<string, unknown>
      const today = dateInSaoPaulo()
      const answer = await dailyAnswer(today)
      if (!answer) return error(request, 'PUZZLE_NOT_FOUND', 404)
      if (!validDeviceId(body.deviceId))
        return error(request, 'INVALID_DEVICE_ID', 400)

      if (body.action === 'bootstrap') {
        if (answer.puzzle_number !== puzzleNumberForDate(answer.puzzle_date))
          return error(request, 'PUZZLE_NUMBER_MISMATCH', 500)
        const [guesses, usedHints, submitted] = await Promise.all([
          dailyGuesses(today, body.deviceId),
          dailyHints(today, body.deviceId),
          resultExists(today, body.deviceId),
        ])
        return json(request, {
          puzzleNumber: answer.puzzle_number,
          puzzleDate: answer.puzzle_date,
          progress: {
            guesses: guesses.map((guess) => {
              const evaluation = matrixValue(gameMatrix, guess.cod, answer.cod)
              if (!evaluation)
                throw new Error('Recorded guess is missing from matrix')
              const correct = guess.cod === answer.cod
              return {
                cod: guess.cod,
                ...evaluation,
                correct,
                ...(correct ? { answer: bairroByCode.get(answer.cod) } : {}),
              }
            }),
            hints: usedHints
              .map((hint) => hintText(hints, answer.cod, hint.tier))
              .filter((text): text is string => Boolean(text)),
            submitted,
          },
        })
      }

      if (
        body.action !== 'guess' &&
        body.action !== 'hint' &&
        body.action !== 'leaderboard' &&
        body.action !== 'nickname' &&
        body.action !== 'explainer'
      )
        return error(request, 'INVALID_ACTION', 400)
      if (body.action !== 'leaderboard' && body.puzzleDate !== today)
        return error(request, 'NOT_TODAY', 400)

      if (body.action === 'leaderboard') {
        if (!(await consumeAction(today, body.deviceId, 'leaderboard', 60)))
          return error(request, 'RATE_LIMITED', 429)
        const leaderboard = await dailyLeaderboard(today, body.deviceId)
        return json(request, {
          entries: leaderboard.entries.map((entry) => ({
            position: entry.position,
            nickname: entry.nickname,
            score: entry.score,
            elapsedSeconds: entry.elapsed_seconds,
            isSelf: entry.is_self,
          })),
          total: leaderboard.total,
        })
      }

      if (body.action === 'nickname') {
        const nickname = validateNickname(body.nickname)
        if (!nickname.ok) return error(request, 'INVALID_NICKNAME', 400)
        if (!(await consumeAction(today, body.deviceId, 'nickname', 20)))
          return error(request, 'RATE_LIMITED', 429)
        const response = await serviceRequest(
          `daily_results?puzzle_date=eq.${encodeURIComponent(today)}&device_id=eq.${encodeURIComponent(body.deviceId)}&select=id`,
          {
            method: 'PATCH',
            headers: { prefer: 'return=representation' },
            body: JSON.stringify({ nickname: nickname.value }),
          },
        )
        if (!response.ok)
          throw new Error(`Nickname update failed: ${response.status}`)
        if (((await response.json()) as { id: string }[]).length === 0)
          return error(request, 'NO_RESULT', 404)
        return json(request, { ok: true, nickname: nickname.value })
      }

      if (body.action === 'explainer') {
        if (!(await resultExists(today, body.deviceId)))
          return error(request, 'NO_RESULT', 404)
        if (!(await consumeAction(today, body.deviceId, 'explainer', 10)))
          return error(request, 'RATE_LIMITED', 429)
        const bairro = bairroByCode.get(answer.cod)
        if (!bairro) throw new Error('Seeded answer is missing from bairros')
        const explainerBody = await explainerFor(answer.cod, bairro.nome)
        return json(
          request,
          explainerBody
            ? { available: true, body: explainerBody }
            : { available: false },
        )
      }

      if (body.action === 'guess') {
        if (typeof body.cod !== 'string' || !knownCodes.has(body.cod))
          return error(request, 'UNKNOWN_CODE', 400)
        if (excludedCodes.has(body.cod))
          return error(request, 'EXCLUDED_CODE', 400)
        const action = actionError(
          request,
          await recordDailyGuess(today, body.deviceId, body.cod, answer.cod),
        )
        if (action) return action
        const evaluation = matrixValue(gameMatrix, body.cod, answer.cod)
        if (!evaluation) throw new Error('Seeded answer is missing from matrix')
        const correct = body.cod === answer.cod
        return json(request, {
          ...evaluation,
          correct,
          ...(correct ? { answer: bairroByCode.get(answer.cod) } : {}),
        })
      }

      if (typeof body.tier !== 'number')
        return error(request, 'INVALID_HINT_TIER', 400)
      const text = hintText(hints, answer.cod, body.tier)
      if (!text) return error(request, 'INVALID_HINT_TIER', 400)
      const action = actionError(
        request,
        await recordDailyHint(today, body.deviceId, body.tier, answer.cod),
      )
      if (action) return action
      return json(request, { text })
    } catch (caught) {
      console.error(caught)
      return error(request, 'INTERNAL_ERROR', 500)
    }
  }
}

Deno.serve(createDailyHandler())
