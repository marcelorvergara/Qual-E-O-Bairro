import { useState } from 'react'
import { scoreBucket, type Stats } from '../game/stats'
import styles from './StatsPanel.module.css'

interface StatsPanelProps {
  stats: Stats
  currentScore: number
}

export function StatsPanel({ stats, currentScore }: StatsPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const buckets = Array.from({ length: 11 }, (_, index) => index + 1)
  const maximum = Math.max(1, ...Object.values(stats.distribution))
  const highlighted = scoreBucket(currentScore)

  return (
    <section aria-label="Suas estatísticas" className={styles.stats}>
      <dl className={styles.summary}>
        <div>
          <dt>Jogos</dt>
          <dd>{stats.played}</dd>
        </div>
        <div>
          <dt>Sequência</dt>
          <dd>{stats.currentStreak}</dd>
        </div>
        <div>
          <dt>Melhor</dt>
          <dd>{stats.maxStreak}</dd>
        </div>
      </dl>
      <details
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        open={expanded}
      >
        <summary>Distribuição</summary>
        <ol className={styles.distribution}>
          {buckets.map((bucket) => {
            const count = stats.distribution[bucket] ?? 0
            return (
              <li
                className={bucket === highlighted ? styles.current : undefined}
                key={bucket}
              >
                <span>{bucket === 11 ? '11+' : bucket}</span>
                <span className={styles.track}>
                  <span
                    className={styles.bar}
                    style={{ width: `${(count / maximum) * 100}%` }}
                  />
                </span>
                <strong>{count}</strong>
              </li>
            )
          })}
        </ol>
      </details>
    </section>
  )
}
