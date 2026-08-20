import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConsentChoice } from '../analytics'
import { dismissReopenedConsent } from './consentDialog'

afterEach(() => vi.unstubAllGlobals())

describe('reopened consent preferences', () => {
  it('dismisses without changing the stored choice', () => {
    const values = new Map([['qeb:consent:v1', 'denied']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    const onClose = vi.fn()

    dismissReopenedConsent(getConsentChoice(), onClose)

    expect(onClose).toHaveBeenCalledOnce()
    expect(values.get('qeb:consent:v1')).toBe('denied')
    expect(getConsentChoice()).toBe('denied')
  })

  it('does not dismiss when no choice exists', () => {
    const onClose = vi.fn()

    dismissReopenedConsent(null, onClose)

    expect(onClose).not.toHaveBeenCalled()
  })
})
