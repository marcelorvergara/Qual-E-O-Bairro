import { useMemo, useRef, useState } from 'react'
import { allBairros } from '../game/data'
import { matchBairros, normalizeName } from '../game/normalize'
import type { Bairro, Guess } from '../game/types'
import styles from './GuessInput.module.css'

interface GuessInputProps {
  guesses: Guess[]
  won: boolean
  onGuess: (bairro: Bairro) => void
}

export function GuessInput({ guesses, won, onGuess }: GuessInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)
  const guessed = useMemo(
    () => new Map(guesses.map((item) => [item.cod, item])),
    [guesses],
  )
  const matches = open ? matchBairros(query, allBairros) : []

  const select = (bairro: Bairro) => {
    if (guessed.has(bairro.cod) || won) return
    onGuess(bairro)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className={styles.wrapper}>
      {matches.length > 0 && (
        <ul className={styles.suggestions} id="bairro-options" role="listbox">
          {matches.map((bairro, index) => {
            const previous = guessed.get(bairro.cod)
            return (
              <li
                aria-disabled={Boolean(previous)}
                aria-selected={index === activeIndex}
                className={`${styles.suggestion} ${index === activeIndex ? styles.active : ''} ${previous ? styles.guessed : ''}`}
                id={`bairro-option-${bairro.cod}`}
                key={bairro.cod}
                onPointerDown={(event) => {
                  event.preventDefault()
                  select(bairro)
                }}
                role="option"
              >
                <span>{bairro.nome}</span>
                {previous && <small>{previous.km.toFixed(1)} km</small>}
              </li>
            )
          })}
        </ul>
      )}
      <input
        aria-activedescendant={
          activeIndex >= 0
            ? `bairro-option-${matches[activeIndex]?.cod}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls="bairro-options"
        aria-expanded={matches.length > 0}
        autoComplete="off"
        autoFocus
        className={styles.input}
        disabled={won}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
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
            const ambiguous = normalizeName(query) === 'freguesia'
            if (activeIndex >= 0) select(matches[activeIndex])
            else if (!ambiguous) select(matches[0])
          }
        }}
        placeholder={won ? 'Você acertou!' : 'Digite um bairro'}
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
      />
    </div>
  )
}
