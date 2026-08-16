import { afterEach, describe, expect, it, vi } from 'vitest'
import { explainer } from './daily'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('explainer API', () => {
  it('accepts an unavailable explainer as a successful response', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ available: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(explainer('device-1')).resolves.toEqual({ available: false })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      action: 'explainer',
      deviceId: 'device-1',
    })
  })
})
