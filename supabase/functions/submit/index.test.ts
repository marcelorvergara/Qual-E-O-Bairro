import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const today = '2026-08-22'

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-22T15:00:00.000Z'))
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) =>
        name === 'SUPABASE_URL' ? 'https://db.test' : 'service-key',
    },
    serve: vi.fn(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function answerResponse(input: string) {
  if (input.includes('daily_answers'))
    return response([{ puzzle_date: today, puzzle_number: 8, cod: '001' }])
  if (input.includes('rpc/daily_leaderboard')) return response([])
  if (input.includes('daily_results?'))
    return response([], 200, { 'content-range': '0-0/1' })
  return null
}

describe('submit request handler', () => {
  it('rejects future-date submissions before reading server data', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({
          puzzleDate: '2026-08-23',
          deviceId: 'device-1',
        }),
      }),
    )

    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toEqual({
      error: { code: 'NOT_TODAY' },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rate limits submissions inside the completion transaction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const known = answerResponse(input)
        if (known) return known
        if (input.includes('rpc/complete_daily_result'))
          return response({ status: 'rate_limited' })
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({ puzzleDate: today, deviceId: 'device-1' }),
      }),
    )

    expect(result.status).toBe(429)
    await expect(result.json()).resolves.toEqual({
      error: { code: 'RATE_LIMITED' },
    })
  })

  it('delegates penalties and timing to the atomic server transaction', async () => {
    let completionBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        const known = answerResponse(input)
        if (known) return known
        if (input.includes('rpc/complete_daily_result')) {
          completionBody = JSON.parse(String(init?.body))
          return response({
            status: 'accepted',
            score: 4,
            elapsed_seconds: 102,
          })
        }
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({
          puzzleDate: today,
          deviceId: 'device-1',
          score: 1,
          elapsedSeconds: 1,
          hints: 0,
        }),
      }),
    )

    expect(result.status).toBe(200)
    expect(completionBody).toEqual({
      requested_date: today,
      requested_device: 'device-1',
      expected_answer: '001',
      requested_nickname: null,
      action_limit: 10,
    })
  })

  it('rejects an impossible sequence from the transaction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const known = answerResponse(input)
        if (known) return known
        if (input.includes('rpc/complete_daily_result'))
          return response({ status: 'impossible_sequence' })
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({ puzzleDate: today, deviceId: 'device-1' }),
      }),
    )

    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toEqual({
      error: { code: 'IMPOSSIBLE_SEQUENCE' },
    })
  })
})
