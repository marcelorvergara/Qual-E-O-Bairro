import { useEffect, useState } from 'react'
import {
  getConsentChoice,
  setConsentChoice,
  type ConsentChoice,
} from '../analytics'
import { useLanguage } from '../i18n'
import styles from './ConsentBanner.module.css'
import { dismissReopenedConsent } from './consentDialog'

export function ConsentBanner({
  onClose,
  open,
}: {
  onClose: () => void
  open: boolean
}) {
  const { text } = useLanguage()
  const [choice, setChoice] = useState<ConsentChoice>(getConsentChoice)

  useEffect(() => {
    if (open) setChoice(getConsentChoice())
  }, [open])

  useEffect(() => {
    if (!open || !choice) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissReopenedConsent(choice, onClose)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [choice, onClose, open])

  if (!open) return null

  const choose = (next: Exclude<ConsentChoice, null>) => {
    setConsentChoice(next)
    setChoice(next)
    onClose()
  }

  return (
    <section
      aria-label={text.analyticsConsentLabel}
      className={styles.banner}
      role="dialog"
    >
      {choice && (
        <button
          aria-label={text.closePrivacySettings}
          className={styles.close}
          onClick={() => dismissReopenedConsent(choice, onClose)}
          type="button"
        >
          ×
        </button>
      )}
      <p>{text.analyticsConsentMessage}</p>
      <div className={styles.actions}>
        <button
          aria-pressed={choice === 'denied'}
          onClick={() => choose('denied')}
          type="button"
        >
          {text.rejectAnalytics}
        </button>
        <button
          aria-pressed={choice === 'granted'}
          onClick={() => choose('granted')}
          type="button"
        >
          {text.acceptAnalytics}
        </button>
      </div>
    </section>
  )
}
