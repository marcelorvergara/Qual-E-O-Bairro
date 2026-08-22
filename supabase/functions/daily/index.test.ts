import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const answer = { puzzle_date: '2026-08-22', puzzle_number: 8, cod: '001' }

function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

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

describe('daily request handler', () => {
  it('keeps the answer out of bootstrap responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('daily_answers')) return response([answer])
        if (input.includes('daily_guesses')) return response([])
        if (input.includes('daily_hints')) return response([])
        if (input.includes('daily_results')) return response([])
        throw new Error(`Unexpected request: ${input}`)
      }),
    )
    const { createDailyHandler } = await import('./index.ts')
    const result = await createDailyHandler()(
      new Request('https://function.test', {
        method: 'POST',
        body: JSON.stringify({ action: 'bootstrap', deviceId: 'device-1' }),
      }),
    )
    const body = await result.text()

    expect(result.status).toBe(200)
    expect(body).not.toContain('001')
    expect(body).not.toContain('salt')
    expect(body).not.toContain('answerHash')
  })
})
