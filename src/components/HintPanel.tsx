import { HINT_ORDER } from '../game/data'
import type { HintCount } from '../game/types'
import styles from './HintPanel.module.css'

const tierLabels: Record<(typeof HINT_ORDER)[number], string> = {
  region: 'Região',
  character: 'Característica',
  giveaway: 'Quase lá',
}

interface HintPanelProps {
  texts: string[]
  used: HintCount
  showExplanation: boolean
  onDismissExplanation: () => void
}

export function HintPanel({
  texts,
  used,
  showExplanation,
  onDismissExplanation,
}: HintPanelProps) {
  const visibleTiers = HINT_ORDER.slice(0, used).reverse()
  if (visibleTiers.length === 0 && !showExplanation) return null

  return (
    <section
      className={styles.panel}
      aria-label="Dicas reveladas"
      aria-live="polite"
    >
      {showExplanation && (
        <div className={styles.explanation}>
          <span>Cada dica vale um palpite no ranking diário</span>
          <button
            aria-label="Dispensar explicação sobre dicas"
            onClick={onDismissExplanation}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {visibleTiers.map((tier, index) => (
        <p className={styles.tier} key={tier}>
          <strong>{tierLabels[tier]}</strong>
          <span>{texts[used - index - 1]}</span>
        </p>
      ))}
    </section>
  )
}
