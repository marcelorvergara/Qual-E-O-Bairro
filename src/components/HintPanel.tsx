import { HINT_ORDER } from '../game/data'
import type { HintCount } from '../game/types'
import { useLanguage } from '../i18n'
import styles from './HintPanel.module.css'

interface HintPanelProps {
  className?: string
  texts: string[]
  used: HintCount
  showExplanation: boolean
  onDismissExplanation: () => void
}

export function HintPanel({
  className,
  texts,
  used,
  showExplanation,
  onDismissExplanation,
}: HintPanelProps) {
  const { text } = useLanguage()
  const visibleTiers = HINT_ORDER.slice(0, used).reverse()
  if (visibleTiers.length === 0 && !showExplanation) return null

  return (
    <section
      className={`${styles.panel} ${className ?? ''}`}
      aria-label={text.revealedHints}
      aria-live="polite"
    >
      {showExplanation && (
        <div className={styles.explanation}>
          <span>{text.hintExplanation}</span>
          <button
            aria-label={text.dismissHintExplanation}
            onClick={onDismissExplanation}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {visibleTiers.map((tier, index) => (
        <p className={styles.tier} key={tier}>
          <strong>{text.hintTiers[tier]}</strong>
          <span>{texts[used - index - 1]}</span>
        </p>
      ))}
    </section>
  )
}
