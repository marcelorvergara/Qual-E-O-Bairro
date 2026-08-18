import { afterEach, describe, expect, it, vi } from 'vitest'
import { corsHeaders } from './server'

afterEach(() => vi.unstubAllGlobals())

function allowOrigins(value: string) {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => (name === 'ALLOWED_ORIGINS' ? value : '') },
  })
}

describe('CORS headers', () => {
  it('caches preflight grants for an allowed origin', () => {
    allowOrigins('https://qualeobairro.com.br')

    expect(
      corsHeaders(
        new Request('https://function.example', {
          headers: { origin: 'https://qualeobairro.com.br' },
        }),
      ),
    ).toMatchObject({
      'access-control-allow-origin': 'https://qualeobairro.com.br',
      'access-control-max-age': '7200',
      vary: 'Origin',
    })
  })

  it('does not cache a CORS grant for an unmatched origin', () => {
    allowOrigins('https://qualeobairro.com.br')

    expect(
      corsHeaders(
        new Request('https://function.example', {
          headers: { origin: 'https://other.example' },
        }),
      ),
    ).toEqual({ vary: 'Origin' })
  })
})
