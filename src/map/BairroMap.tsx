import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Guess } from '../game/types'
import { createBairroPaths } from './geometry'
import styles from './BairroMap.module.css'

interface Size {
  width: number
  height: number
}

interface BairroMapProps {
  guesses: Guess[]
  answerCod: string
}

export function BairroMap({ guesses, answerCod }: BairroMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [hoveredName, setHoveredName] = useState('')

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = ({ width, height }: Size) => {
      setSize({ width: Math.round(width), height: Math.round(height) })
    }
    update(container.getBoundingClientRect())

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const paths = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? createBairroPaths(size.width, size.height)
        : [],
    [size],
  )
  const guessesByCode = new Map(guesses.map((guess) => [guess.cod, guess]))

  return (
    <div className={styles.mapPanel} ref={containerRef}>
      <div className={styles.hoverLabel} aria-live="polite">
        {hoveredName}
      </div>
      {size.width > 0 && size.height > 0 && (
        <svg
          className={styles.map}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="Mapa dos bairros do Rio de Janeiro"
        >
          <g>
            {paths.map(({ feature, path }) => {
              const cod = feature.properties.codbairro
              const item = guessesByCode.get(cod)
              const stateClass = item
                ? cod === answerCod
                  ? styles.correct
                  : item.bucket === 'encosta'
                    ? styles.encosta
                    : styles[`bucket${item.bucket}`]
                : ''
              return (
                <path
                  className={`${styles.bairro} ${item ? styles.guessed : ''} ${stateClass}`}
                  d={path}
                  data-cod={cod}
                  key={cod}
                  onPointerEnter={() => setHoveredName(feature.properties.nome)}
                  onPointerLeave={() => setHoveredName('')}
                />
              )
            })}
          </g>
        </svg>
      )}
    </div>
  )
}
