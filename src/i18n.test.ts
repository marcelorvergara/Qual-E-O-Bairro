import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  englishFeatureEnabled,
  LanguageProvider,
  LanguageToggle,
  useLanguage,
} from './i18n'

function LanguageProbe() {
  const { language } = useLanguage()
  return createElement('span', null, language)
}

afterEach(() => vi.unstubAllGlobals())

describe('English feature flag', () => {
  it('defaults to disabled', () => {
    expect(englishFeatureEnabled(undefined)).toBe(false)
    expect(englishFeatureEnabled('false')).toBe(false)
    expect(englishFeatureEnabled('true')).toBe(true)
  })

  it('does not render the toggle when disabled', () => {
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { enableEnglish: false },
        createElement(LanguageToggle),
      ),
    )
    expect(markup).toBe('')
  })

  it('forces PT-BR and ignores a stale stored English preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' })
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        { enableEnglish: false },
        createElement(LanguageProbe),
      ),
    )
    expect(markup).toContain('pt-BR')
    expect(markup).not.toContain('en')
  })
})
