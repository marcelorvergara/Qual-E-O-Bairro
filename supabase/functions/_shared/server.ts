export interface DailyAnswer {
  puzzle_date: string
  puzzle_number: number
  cod: string
}

export interface DailyGuess {
  id: number
  cod: string
  created_at: string
}

export interface DailyHint {
  tier: number
}

export type DailyActionStatus =
  | 'accepted'
  | 'already_submitted'
  | 'duplicate_guess'
  | 'game_complete'
  | 'incomplete_game'
  | 'impossible_sequence'
  | 'invalid_hint_tier'
  | 'rate_limited'

function environment(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value.replace(/\/$/, '')
}

export async function serviceRequest(path: string, init?: RequestInit) {
  const key = environment('SUPABASE_SERVICE_ROLE_KEY')
  return fetch(`${environment('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
}

export async function dailyAnswer(date: string): Promise<DailyAnswer | null> {
  const select = 'puzzle_date,puzzle_number,cod'
  const response = await serviceRequest(
    `daily_answers?puzzle_date=eq.${encodeURIComponent(date)}&select=${select}&limit=1`,
  )
  if (!response.ok)
    throw new Error(`Daily answer query failed: ${response.status}`)
  const rows = (await response.json()) as DailyAnswer[]
  return rows[0] ?? null
}

export async function dailyGuesses(date: string, deviceId: string) {
  const response = await serviceRequest(
    `daily_guesses?puzzle_date=eq.${encodeURIComponent(date)}&device_id=eq.${encodeURIComponent(deviceId)}&select=id,cod,created_at&order=id.asc`,
  )
  if (!response.ok)
    throw new Error(`Daily guesses query failed: ${response.status}`)
  return (await response.json()) as DailyGuess[]
}

export async function dailyHints(date: string, deviceId: string) {
  const response = await serviceRequest(
    `daily_hints?puzzle_date=eq.${encodeURIComponent(date)}&device_id=eq.${encodeURIComponent(deviceId)}&select=tier&order=tier.asc`,
  )
  if (!response.ok)
    throw new Error(`Daily hints query failed: ${response.status}`)
  return (await response.json()) as DailyHint[]
}

async function dailyAction(
  name: 'record_daily_guess' | 'record_daily_hint' | 'complete_daily_result',
  body: Record<string, unknown>,
): Promise<DailyActionStatus> {
  const response = await serviceRequest(`rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${name} failed: ${response.status}`)
  const result = (await response.json()) as { status?: unknown }
  if (typeof result.status !== 'string') throw new Error(`${name} is invalid`)
  return result.status as DailyActionStatus
}

export function recordDailyGuess(
  date: string,
  deviceId: string,
  cod: string,
  answer: string,
) {
  return dailyAction('record_daily_guess', {
    requested_date: date,
    requested_device: deviceId,
    requested_cod: cod,
    expected_answer: answer,
    action_limit: 200,
  })
}

export function recordDailyHint(
  date: string,
  deviceId: string,
  tier: number,
  answer: string,
) {
  return dailyAction('record_daily_hint', {
    requested_date: date,
    requested_device: deviceId,
    requested_tier: tier,
    expected_answer: answer,
    action_limit: 20,
  })
}

export function completeDailyResult(
  date: string,
  deviceId: string,
  answer: string,
  nickname: string | null,
) {
  return dailyAction('complete_daily_result', {
    requested_date: date,
    requested_device: deviceId,
    expected_answer: answer,
    requested_nickname: nickname,
    action_limit: 10,
  })
}

export async function consumeAction(
  date: string,
  deviceId: string,
  action:
    'guess' | 'hint' | 'leaderboard' | 'nickname' | 'explainer' | 'submit',
  limit: number,
): Promise<boolean> {
  const response = await serviceRequest('rpc/consume_daily_action', {
    method: 'POST',
    body: JSON.stringify({
      requested_date: date,
      requested_device: deviceId,
      requested_action: action,
      action_limit: limit,
    }),
  })
  if (!response.ok)
    throw new Error(`Rate limit query failed: ${response.status}`)
  return (await response.json()) === true
}

export interface LeaderboardRow {
  position: number
  nickname: string | null
  score: number
  elapsed_seconds: number
  is_self: boolean
}

export async function dailyLeaderboard(date: string, deviceId: string) {
  const response = await serviceRequest('rpc/daily_leaderboard', {
    method: 'POST',
    body: JSON.stringify({ p_date: date, p_device: deviceId }),
  })
  if (!response.ok)
    throw new Error(`Leaderboard query failed: ${response.status}`)
  const entries = (await response.json()) as LeaderboardRow[]

  const countResponse = await serviceRequest(
    `daily_results?puzzle_date=eq.${encodeURIComponent(date)}&select=id`,
    { headers: { prefer: 'count=exact', range: '0-0' } },
  )
  if (!countResponse.ok)
    throw new Error(`Leaderboard count failed: ${countResponse.status}`)
  const total = Number(
    countResponse.headers.get('content-range')?.split('/')[1],
  )
  if (!Number.isInteger(total)) throw new Error('Leaderboard count is invalid')
  return { entries, total }
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!origin || !configured.includes(origin)) {
    return { vary: 'Origin' }
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '7200',
    vary: 'Origin',
  }
}

export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) })
}

export function error(
  request: Request,
  code: string,
  status: number,
): Response {
  return json(request, { error: { code } }, status)
}

export function validDeviceId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= 128
  )
}
