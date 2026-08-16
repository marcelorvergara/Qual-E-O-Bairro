import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { allBairros } from '../game/data'
import { matchBairros, normalizeName } from '../game/normalize'
import type { Bairro, GameState, Guess } from '../game/types'
import { BairroMap } from '../map/BairroMap'
import styles from './GuessInput.module.css'

interface GuessInputProps {
  guesses: Guess[]
  pulseCod?: string
  status: GameState['status']
  disabled?: boolean
  onGuess: (bairro: Bairro) => void
}

export function GuessInput({
  guesses,
  pulseCod,
  status,
  disabled = false,
  onGuess,
}: GuessInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayInputRef = useRef<HTMLInputElement>(null)
  const pushedHistory = useRef(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const [viewport, setViewport] = useState({
    top: 0,
    height: window.innerHeight,
  })
  const touchDevice = window.matchMedia('(hover: none)').matches
  const guessed = useMemo(
    () => new Map(guesses.map((item) => [item.cod, item])),
    [guesses],
  )
  const matches =
    open && (!overlay || normalizeName(query))
      ? matchBairros(query, allBairros)
      : []
  const won = status === 'won'

  const closeOverlay = (goBack = true) => {
    setOverlay(false)
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
    inputRef.current?.blur()
    overlayInputRef.current?.blur()
    if (goBack && pushedHistory.current) {
      pushedHistory.current = false
      history.back()
    }
  }

  useEffect(() => {
    if (!overlay) return
    const visual = window.visualViewport
    const resize = () =>
      setViewport({
        top: visual?.offsetTop ?? 0,
        height: visual?.height ?? window.innerHeight,
      })
    const pop = () => {
      pushedHistory.current = false
      closeOverlay(false)
    }
    resize()
    visual?.addEventListener('resize', resize)
    window.addEventListener('popstate', pop)
    requestAnimationFrame(() => overlayInputRef.current?.focus())
    return () => {
      visual?.removeEventListener('resize', resize)
      window.removeEventListener('popstate', pop)
    }
  }, [overlay])

  const startOverlay = () => {
    if (!touchDevice || overlay) return
    history.pushState({ guessOverlay: true }, '')
    pushedHistory.current = true
    setOpen(true)
    setOverlay(true)
  }

  const select = (bairro: Bairro, fromOverlay = false) => {
    if (guessed.has(bairro.cod) || won) return
    onGuess(bairro)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    if (fromOverlay) closeOverlay()
    else requestAnimationFrame(() => inputRef.current?.focus())
  }

  const keyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    fromOverlay = false,
  ) => {
    if (event.key === 'Escape') {
      if (fromOverlay) closeOverlay()
      else setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      matches.length > 0
    ) {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => {
        const start = current < 0 ? (direction > 0 ? -1 : 0) : current
        return (start + direction + matches.length) % matches.length
      })
    }
    if (event.key === 'Enter' && matches.length > 0) {
      event.preventDefault()
      if (activeIndex >= 0) select(matches[activeIndex], fromOverlay)
      else if (normalizeName(query) !== 'freguesia')
        select(matches[0], fromOverlay)
    }
  }

  const rows = (fromOverlay: boolean) => (
    <ul
      className={fromOverlay ? styles.overlaySuggestions : styles.suggestions}
      id={fromOverlay ? 'touch-bairro-options' : 'bairro-options'}
      role="listbox"
    >
      {matches.map((bairro, index) => {
        const previous = guessed.get(bairro.cod)
        return (
          <li key={bairro.cod} role="presentation">
            <button
              aria-selected={index === activeIndex}
              className={`${styles.suggestion} ${index === activeIndex ? styles.active : ''}`}
              disabled={Boolean(previous)}
              id={`${fromOverlay ? 'touch-' : ''}bairro-option-${bairro.cod}`}
              onPointerDown={(event) => {
                event.preventDefault()
                select(bairro, fromOverlay)
              }}
              role="option"
              type="button"
            >
              <span>{bairro.nome}</span>
              {previous && <small>{previous.km.toFixed(1)} km</small>}
            </button>
          </li>
        )
      })}
    </ul>
  )

  const input = (
    ref: React.RefObject<HTMLInputElement | null>,
    fromOverlay = false,
  ) => (
    <input
      aria-activedescendant={
        activeIndex >= 0
          ? `${fromOverlay ? 'touch-' : ''}bairro-option-${matches[activeIndex]?.cod}`
          : undefined
      }
      aria-autocomplete="list"
      aria-controls={fromOverlay ? 'touch-bairro-options' : 'bairro-options'}
      aria-expanded={matches.length > 0}
      autoComplete="off"
      autoFocus={!touchDevice && !fromOverlay}
      className={styles.input}
      disabled={won || disabled}
      onChange={(event) => {
        setQuery(event.target.value)
        setOpen(true)
        setActiveIndex(-1)
      }}
      onFocus={() => {
        setOpen(true)
        if (!fromOverlay) startOverlay()
      }}
      onKeyDown={(event) => keyDown(event, fromOverlay)}
      placeholder={
        won ? 'Você acertou!' : disabled ? 'Aguarde…' : 'Digite um bairro'
      }
      ref={ref}
      role="combobox"
      type="text"
      value={query}
    />
  )

  return (
    <div className={styles.wrapper}>
      {!touchDevice && matches.length > 0 && rows(false)}
      {input(inputRef)}
      {overlay &&
        createPortal(
          <div
            aria-label="Buscar bairro"
            aria-modal="true"
            className={styles.overlay}
            role="dialog"
            style={{ height: viewport.height, top: viewport.top }}
          >
            <div className={styles.overlayHeader}>
              {input(overlayInputRef, true)}
              <button onClick={() => closeOverlay()} type="button">
                Cancelar
              </button>
            </div>
            {matches.length > 0 && rows(true)}
            <div className={styles.overlayMap}>
              <BairroMap
                compact
                guesses={guesses}
                pulseCod={pulseCod}
                status={status}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
