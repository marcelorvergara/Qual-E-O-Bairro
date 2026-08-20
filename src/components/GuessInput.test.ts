import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { GuessInput } from './GuessInput'

afterEach(() => vi.unstubAllGlobals())

describe('GuessInput win state', () => {
  it('renders no input after the game is won', () => {
    vi.stubGlobal('window', {
      innerHeight: 640,
      matchMedia: () => ({ matches: false }),
    })

    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(GuessInput, {
          guesses: [],
          status: 'won',
          onGuess: vi.fn(),
        }),
      ),
    )

    expect(markup).toBe('')
  })
})
