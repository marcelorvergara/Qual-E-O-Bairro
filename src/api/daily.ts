import type { Evaluation } from '../game/types'
import type { LeaderboardEntry } from '../game/leaderboard'

export interface Bootstrap {
  puzzleNumber: number
  puzzleDate: string
  salt: string
  answerHash: string
}

export interface SubmitPayload {
  puzzleDate: string
  deviceId: string
  guesses: { cod: string; km: number; adjacent: boolean }[]
  hints: number
  elapsedSeconds: number
  nickname?: string
}

export interface Leaderboard {
  entries: LeaderboardEntry[]
  total: number
}

export type ExplainerResponse =
  { available: true; body: string } | { available: false }

const messages: Record<string, string> = {
  PUZZLE_NOT_FOUND: 'O desafio de hoje ainda não está disponível.',
  PUZZLE_NUMBER_MISMATCH: 'O desafio de hoje está com dados inconsistentes.',
  INVALID_PUZZLE_DATE: 'A data do desafio é inválida.',
  INVALID_DEVICE_ID: 'Não foi possível identificar este dispositivo.',
  INVALID_ACTION: 'A ação solicitada é inválida.',
  UNKNOWN_CODE: 'Esse bairro não faz parte do jogo.',
  EXCLUDED_CODE: 'Esse bairro não está disponível.',
  INVALID_HINT_TIER: 'Essa dica não está disponível.',
  RATE_LIMITED: 'Limite de tentativas atingido hoje.',
  ALREADY_SUBMITTED: 'Resultado já enviado.',
  MATRIX_MISMATCH: 'O resultado não pôde ser validado.',
  DUPLICATE_CODE: 'Há um palpite repetido no resultado.',
  ANSWER_BEFORE_FINAL: 'A sequência de palpites é inválida.',
  FINAL_ANSWER_INCORRECT: 'O último palpite não é a resposta.',
  INVALID_HINTS: 'A quantidade de dicas é inválida.',
  INVALID_ELAPSED_SECONDS: 'O tempo da partida é inválido.',
  INVALID_SCORE: 'A pontuação não pôde ser validada.',
  INVALID_NICKNAME: 'Esse apelido não pode ser usado.',
  NO_RESULT: 'Envie o resultado antes de salvar o apelido.',
  METHOD_NOT_ALLOWED: 'O servidor recusou a solicitação.',
  INTERNAL_ERROR: 'O servidor encontrou um erro.',
}

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('O modo diário não está configurado neste ambiente.')
  }
  return { url, key }
}

async function call<T>(name: 'daily' | 'submit', body: unknown): Promise<T> {
  const { url, key } = config()
  let response: Response
  try {
    response = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor.')
  }
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!response.ok) {
    const detail = data?.error as Record<string, unknown> | undefined
    const code = typeof detail?.code === 'string' ? detail.code : ''
    const error = new Error(
      messages[code] ?? 'O servidor não respondeu como esperado.',
    )
    error.name = code
    throw error
  }
  if (!data) throw new Error('O servidor não respondeu como esperado.')
  return data as T
}

export function bootstrap(): Promise<Bootstrap> {
  return call<Record<string, unknown>>('daily', { action: 'bootstrap' }).then(
    (data) => {
      if (
        typeof data.puzzleNumber !== 'number' ||
        typeof data.puzzleDate !== 'string' ||
        typeof data.salt !== 'string' ||
        typeof data.answerHash !== 'string'
      )
        throw new Error('O servidor não respondeu como esperado.')
      return data as unknown as Bootstrap
    },
  )
}

export function guess(deviceId: string, cod: string): Promise<Evaluation> {
  return call<Record<string, unknown>>('daily', {
    action: 'guess',
    deviceId,
    cod,
  }).then((data) => {
    if (
      typeof data.km !== 'number' ||
      typeof data.adjacent !== 'boolean' ||
      typeof data.correct !== 'boolean'
    )
      throw new Error('O servidor não respondeu como esperado.')
    const answer = data.answer as Record<string, unknown> | undefined
    if (
      data.correct &&
      (!answer ||
        typeof answer.cod !== 'string' ||
        typeof answer.nome !== 'string' ||
        typeof answer.rp !== 'string')
    )
      throw new Error('O servidor não respondeu como esperado.')
    return data as unknown as Evaluation
  })
}

export function hint(deviceId: string, tier: 1 | 2 | 3) {
  return call<{ text: string }>('daily', {
    action: 'hint',
    deviceId,
    tier,
  }).then(({ text }) => {
    if (typeof text !== 'string')
      throw new Error('O servidor não respondeu como esperado.')
    return text
  })
}

export function submit(
  payload: SubmitPayload,
): Promise<{ ok: true; position?: number; total?: number }> {
  return call<Record<string, unknown>>('submit', payload).then((data) => {
    if (data.ok !== true)
      throw new Error('O servidor não respondeu como esperado.')
    if (
      (data.position !== undefined && typeof data.position !== 'number') ||
      (data.total !== undefined && typeof data.total !== 'number')
    )
      throw new Error('O servidor não respondeu como esperado.')
    return data as { ok: true; position?: number; total?: number }
  })
}

export function leaderboard(deviceId: string): Promise<Leaderboard> {
  return call<Record<string, unknown>>('daily', {
    action: 'leaderboard',
    deviceId,
  }).then((data) => {
    if (!Array.isArray(data.entries) || typeof data.total !== 'number')
      throw new Error('O servidor não respondeu como esperado.')
    const valid = data.entries.every((value) => {
      const entry = value as Record<string, unknown>
      return (
        typeof entry.position === 'number' &&
        (entry.nickname === null || typeof entry.nickname === 'string') &&
        typeof entry.score === 'number' &&
        typeof entry.elapsedSeconds === 'number' &&
        typeof entry.isSelf === 'boolean' &&
        !('deviceId' in entry) &&
        !('device_id' in entry)
      )
    })
    if (!valid) throw new Error('O servidor não respondeu como esperado.')
    return data as unknown as Leaderboard
  })
}

export function updateNickname(
  deviceId: string,
  nickname: string,
): Promise<string> {
  return call<Record<string, unknown>>('daily', {
    action: 'nickname',
    deviceId,
    nickname,
  }).then((data) => {
    if (data.ok !== true || typeof data.nickname !== 'string')
      throw new Error('O servidor não respondeu como esperado.')
    return data.nickname
  })
}

export function explainer(deviceId: string): Promise<ExplainerResponse> {
  return call<Record<string, unknown>>('daily', {
    action: 'explainer',
    deviceId,
  }).then((data) => {
    if (data.available === false) return { available: false }
    if (data.available !== true || typeof data.body !== 'string')
      throw new Error('O servidor não respondeu como esperado.')
    return { available: true, body: data.body }
  })
}

export function isAlreadySubmitted(error: unknown): boolean {
  return error instanceof Error && error.name === 'ALREADY_SUBMITTED'
}
