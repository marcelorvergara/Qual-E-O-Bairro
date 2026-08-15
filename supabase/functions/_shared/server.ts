export interface DailyAnswer {
  puzzle_date: string
  puzzle_number: number
  cod: string
  salt: string
  answer_hash: string
}

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
  const select = 'puzzle_date,puzzle_number,cod,salt,answer_hash'
  const response = await serviceRequest(
    `daily_answers?puzzle_date=eq.${encodeURIComponent(date)}&select=${select}&limit=1`,
  )
  if (!response.ok)
    throw new Error(`Daily answer query failed: ${response.status}`)
  const rows = (await response.json()) as DailyAnswer[]
  return rows[0] ?? null
}

export async function consumeAction(
  date: string,
  deviceId: string,
  action: 'guess' | 'hint',
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

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!origin || !['http://localhost:5173', ...configured].includes(origin)) {
    return { vary: 'Origin' }
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
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
