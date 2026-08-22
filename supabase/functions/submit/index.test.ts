import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const guesses = [
  { id: 1, cod: '002', created_at: '2026-08-22T12:00:00.000Z' },
  { id: 2, cod: '001', created_at: '2026-08-22T12:01:42.000Z' },
]

beforeEach(() => {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) =>
        name === 'SUPABASE_URL' ? 'https://db.test' : 'service-key',
    },
    serve: vi.fn(),
  })
})

afterEach(() => vi.unstubAllGlobals())

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

  it('rate limits submissions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('rpc/consume_daily_action')) return response(false)
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({
          puzzleDate: '2026-08-22',
          deviceId: 'device-1',
        }),
      }),
    )

    expect(result.status).toBe(429)
    await expect(result.json()).resolves.toEqual({
      error: { code: 'RATE_LIMITED' },
    })
  })

  it('derives hint penalties and elapsed time from recorded events', async () => {
    let inserted: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (input.includes('rpc/consume_daily_action')) return response(true)
        if (input.includes('daily_answers'))
          return response([
            { puzzle_date: '2026-08-22', puzzle_number: 8, cod: '001' },
          ])
        if (input.includes('daily_guesses')) return response(guesses)
        if (input.includes('daily_hints'))
          return response([{ tier: 1 }, { tier: 2 }])
        if (input.endsWith('/daily_results')) {
          inserted = JSON.parse(String(init?.body))
          return response({}, 201)
        }
        if (input.includes('rpc/daily_leaderboard')) return response([])
        if (input.includes('daily_results?'))
          return response([], 200, { 'content-range': '0-0/1' })
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({
          puzzleDate: '2026-08-22',
          deviceId: 'device-1',
          score: 1,
          elapsedSeconds: 1,
          hints: 0,
        }),
      }),
    )

    expect(result.status).toBe(200)
    expect(inserted).toMatchObject({
      guesses: 2,
      hints: 2,
      score: 4,
      elapsed_seconds: 102,
      guess_codes: ['002', '001'],
    })
  })

  it('rejects an impossible server-recorded sequence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('rpc/consume_daily_action')) return response(true)
        if (input.includes('daily_answers'))
          return response([
            { puzzle_date: '2026-08-22', puzzle_number: 8, cod: '001' },
          ])
        if (input.includes('daily_guesses'))
          return response([guesses[1], guesses[0]])
        if (input.includes('daily_hints')) return response([])
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createSubmitHandler } = await import('./index.ts')
    const result = await createSubmitHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({
          puzzleDate: '2026-08-22',
          deviceId: 'device-1',
        }),
      }),
    )

    expect(result.status).toBe(400)
    await expect(result.json()).resolves.toEqual({
      error: { code: 'IMPOSSIBLE_SEQUENCE' },
    })
  })
})
