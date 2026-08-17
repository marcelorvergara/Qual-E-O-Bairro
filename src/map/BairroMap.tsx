import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GameState, Guess } from '../game/types'
import { useLanguage } from '../i18n'
import { createBairroPaths } from './geometry'
import { layoutLabels } from './labels'
import styles from './BairroMap.module.css'

interface Size {
  width: number
  height: number
}

interface ActiveBairro {
  cod: string
  name: string
}

interface BairroMapProps {
  guesses: Guess[]
  pulseCod?: string
  status: GameState['status']
  compact?: boolean
}

function guessText(guess: Guess, adjacent: string): string {
  if (guess.bucket === 0) return '✓'
  if (guess.bucket === 'encosta') return adjacent
  return `${guess.km.toFixed(1)} km`
}

export function BairroMap({
  guesses,
  pulseCod,
  status,
  compact = false,
}: BairroMapProps) {
  const { text } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const touchLabelTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tapPulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [activeBairro, setActiveBairro] = useState<ActiveBairro>()
  const [tapPulseCod, setTapPulseCod] = useState<string>()

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

  useEffect(
    () => () => {
      clearTimeout(touchLabelTimer.current)
      clearTimeout(tapPulseTimer.current)
    },
    [],
  )

  const canHover = () => window.matchMedia('(hover: hover)').matches
  const interactionText = (cod: string, name: string) => {
    if (status === 'won') return name
    const item = guesses.find((guess) => guess.cod === cod)
    return item ? `${name} · ${guessText(item, text.adjacent)}` : ''
  }
  // Names stay hidden for unguessed paths during play to avoid leaking the answer space.
  const handleTouch = (cod: string, name: string) => {
    if (canHover()) return
    const text = interactionText(cod, name)
    if (!text) {
      clearTimeout(tapPulseTimer.current)
      setTapPulseCod(cod)
      tapPulseTimer.current = setTimeout(() => setTapPulseCod(undefined), 300)
      return
    }
    clearTimeout(touchLabelTimer.current)
    setActiveBairro({ cod, name })
    touchLabelTimer.current = setTimeout(() => setActiveBairro(undefined), 1500)
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
      return [
        item.cod,
        `${bairro?.nome ?? ''} · ${guessText(item, text.adjacent)}`,
      ]
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
    { width: size.width, height: size.height },
  )

  return (
    <div
      className={`${styles.mapPanel} ${compact ? styles.compact : ''}`}
      ref={containerRef}
    >
      <div className={styles.hoverLabel} aria-live="polite">
        {activeBairro
          ? interactionText(activeBairro.cod, activeBairro.name)
          : ''}
      </div>
      {size.width > 0 && size.height > 0 && (
        <svg
          className={styles.map}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={text.mapLabel}
        >
          <g>
            {paths.map(({ feature, path }) => {
              const cod = feature.properties.codbairro
              const item = guessesByCode.get(cod)
              const stateClass = item
                ? item.bucket === 0
                  ? styles.correct
                  : item.bucket === 'encosta'
                    ? styles.encosta
                    : styles[`bucket${item.bucket}`]
                : ''
              return (
                <path
                  className={`${styles.bairro} ${item ? styles.guessed : ''} ${cod === newestCod ? styles.newest : ''} ${cod === pulseCod ? styles.pulse : ''} ${cod === tapPulseCod ? styles.tapPulse : ''} ${stateClass}`}
                  d={path}
                  data-cod={cod}
                  key={cod}
                  onPointerDown={() =>
                    handleTouch(cod, feature.properties.nome)
                  }
                  onPointerEnter={() => {
                    if (canHover())
                      setActiveBairro({ cod, name: feature.properties.nome })
                  }}
                  onPointerLeave={() => {
                    if (canHover()) setActiveBairro(undefined)
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
