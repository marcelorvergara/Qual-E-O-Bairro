import { useState } from 'react'
import {
  getConsentChoice,
  setConsentChoice,
  type ConsentChoice,
} from '../analytics'
import { useLanguage } from '../i18n'
import styles from './ConsentBanner.module.css'

export function ConsentBanner() {
  const { text } = useLanguage()
  const [choice, setChoice] = useState<ConsentChoice>(getConsentChoice)
  if (choice) return null

  const choose = (next: Exclude<ConsentChoice, null>) => {
    setConsentChoice(next)
    setChoice(next)
  }

  return (
    <section
      aria-label={text.analyticsConsentLabel}
      className={styles.banner}
      role="dialog"
    >
      <p>{text.analyticsConsentMessage}</p>
      <div className={styles.actions}>
        <button onClick={() => choose('denied')} type="button">
          {text.rejectAnalytics}
        </button>
        <button onClick={() => choose('granted')} type="button">
          {text.acceptAnalytics}
        </button>
      </div>
    </section>
  )
}
