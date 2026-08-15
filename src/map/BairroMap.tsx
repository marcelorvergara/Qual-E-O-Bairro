import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Guess } from '../game/types'
import { createBairroPaths } from './geometry'
import { layoutLabels } from './labels'
import styles from './BairroMap.module.css'

interface Size {
  width: number
  height: number
}

interface BairroMapProps {
  guesses: Guess[]
  answerCod: string
  pulseCod?: string
}

function guessText(guess: Guess): string {
  if (guess.bucket === 0) return '✓'
  if (guess.bucket === 'encosta') return 'encosta'
  return `${guess.km.toFixed(1)} km`
}

export function BairroMap({ guesses, answerCod, pulseCod }: BairroMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const touchLabelTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
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

  useEffect(() => () => clearTimeout(touchLabelTimer.current), [])

  const canHover = () => window.matchMedia('(hover: hover)').matches
  const showTouchedName = (name: string) => {
    if (canHover()) return
    clearTimeout(touchLabelTimer.current)
    setHoveredName(name)
    touchLabelTimer.current = setTimeout(() => setHoveredName(''), 1500)
  }

  const paths = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? createBairroPaths(size.width, size.height)
        : [],
    [size],
  )
  const guessesByCode = new Map(guesses.map((guess) => [guess.cod, guess]))
  const newestCod = guesses.at(-1)?.cod
  const pathByCode = new Map(
    paths.map((item) => [item.feature.properties.codbairro, item]),
  )
  const labelContent = new Map(
    guesses.map((item) => {
      const bairro = pathByCode.get(item.cod)?.feature.properties
      return [item.cod, `${bairro?.nome ?? ''} · ${guessText(item)}`]
    }),
  )
  const labels = layoutLabels(
    guesses.flatMap((guess) => {
      const item = pathByCode.get(guess.cod)
      const text = labelContent.get(guess.cod)
      return item && text
        ? [
            {
              cod: guess.cod,
              anchor: item.centroid,
              bounds: item.bounds,
              width: Math.max(44, text.length * 6.2),
              height: 16,
            },
          ]
        : []
    }),
  )

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
                  className={`${styles.bairro} ${item ? styles.guessed : ''} ${cod === newestCod ? styles.newest : ''} ${cod === pulseCod ? styles.pulse : ''} ${stateClass}`}
                  d={path}
                  data-cod={cod}
                  key={cod}
                  onPointerDown={() => showTouchedName(feature.properties.nome)}
                  onPointerEnter={() => {
                    if (canHover()) setHoveredName(feature.properties.nome)
                  }}
                  onPointerLeave={() => {
                    if (canHover()) setHoveredName('')
                  }}
                />
              )
            })}
          </g>
          <g className={styles.labels} aria-hidden="true">
            {labels.map((label) => (
              <g
                className={`${styles.label} ${label.cod === newestCod ? styles.recentLabel : ''}`}
                key={label.cod}
              >
                {label.leader && <line {...label.leader} />}
                <text x={label.x} y={label.y}>
                  {labelContent.get(label.cod)}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  )
}
