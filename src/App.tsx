import { useEffect, useRef, useState } from 'react'
import { ExplainerPlaceholder } from './components/ExplainerPlaceholder'
import { GuessInput } from './components/GuessInput'
import { HintPanel } from './components/HintPanel'
import { allBairros, hintsFor, poolFor } from './game/data'
import {
  guess,
  guessCount,
  newGame,
  reset,
  useHint as revealNextHint,
} from './game/reducer'
import type { Bairro, PoolName } from './game/types'
import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

const knownCodes = new Set(poolFor('conhecidos').map(({ cod }) => cod))
const hintExplanationKey = 'hint-ranking-explanation-seen'

export default function App() {
  const [game, setGame] = useState(() => newGame('conhecidos'))
  const [pulseCod, setPulseCod] = useState<string>()
  const [showHintExplanation, setShowHintExplanation] = useState(false)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bairrosByCode = new Map(
    allBairros.map((bairro) => [bairro.cod, bairro]),
  )

  useEffect(() => () => clearTimeout(pulseTimer.current), [])

  const submitGuess = (bairro: Bairro) => {
    if (bairro.cod === game.answer.cod) setShowHintExplanation(false)
    setGame((state) => guess(state, bairro.cod))
  }
  const startPool = (pool: PoolName) => setGame(newGame(pool))
  const revealHint = () => {
    setGame((state) => revealNextHint(state))
    try {
      if (!sessionStorage.getItem(hintExplanationKey)) {
        sessionStorage.setItem(hintExplanationKey, '1')
        setShowHintExplanation(true)
      }
    } catch {
      setShowHintExplanation(true)
    }
  }
  const pulse = (cod: string) => {
    clearTimeout(pulseTimer.current)
    setPulseCod(undefined)
    requestAnimationFrame(() => {
      setPulseCod(cod)
      pulseTimer.current = setTimeout(() => setPulseCod(undefined), 600)
    })
  }

  return (
    <main className={styles.app}>
      <BairroMap
        answerCod={game.answer.cod}
        guesses={game.guesses}
        pulseCod={pulseCod}
        status={game.status}
      />
      <section className={styles.gamePanel} aria-label="Área de palpites">
        <div className={styles.panelContent}>
          <div className={styles.guessStrip} aria-label="Histórico de palpites">
            {[...game.guesses].reverse().map((item) => {
              const bairro = bairrosByCode.get(item.cod)
              const result =
                item.bucket === 0
                  ? '✓'
                  : item.bucket === 'encosta'
                    ? 'encosta'
                    : `${item.km.toFixed(1)} km`
              return (
                <button
                  className={`${styles.chip} ${item.bucket === 'encosta' ? styles.encosta : styles[`bucket${item.bucket}`]}`}
                  key={item.cod}
                  onClick={() => pulse(item.cod)}
                  type="button"
                >
                  {bairro?.nome} · {result}
                </button>
              )
            })}
          </div>
          <div className={styles.controls}>
            <div className={styles.segmented} aria-label="Seleção de conjunto">
              {(['conhecidos', 'todos'] as const).map((pool) => (
                <button
                  aria-pressed={game.pool === pool}
                  key={pool}
                  onClick={() => startPool(pool)}
                  type="button"
                >
                  {pool === 'conhecidos' ? 'Conhecidos' : 'Todos'}
                </button>
              ))}
            </div>
            <span className={styles.scoreCount}>
              {guessCount(game)} palpites
              {game.hintsUsed > 0 && ` · ${game.hintsUsed} dicas`}
            </span>
            <button
              disabled={game.status === 'won' || game.hintsUsed === 3}
              onClick={revealHint}
              type="button"
            >
              Dica ({3 - game.hintsUsed})
            </button>
            <button
              className={styles.newGame}
              onClick={() => setGame(reset(game))}
              type="button"
            >
              Novo jogo
            </button>
          </div>
          <HintPanel
            hints={hintsFor(game.answer.cod)}
            onDismissExplanation={() => setShowHintExplanation(false)}
            showExplanation={showHintExplanation}
            used={game.hintsUsed}
          />
          {game.status === 'won' && (
            <>
              <div className={styles.winBanner} role="status">
                <span>
                  <strong>{game.answer.nome}</strong> · {game.answer.rp} ·{' '}
                  {guessCount(game)} palpites
                </span>
                <button onClick={() => setGame(reset(game))} type="button">
                  Jogar de novo
                </button>
              </div>
              <ExplainerPlaceholder
                bairro={game.answer}
                className={styles.explainer}
                known={knownCodes.has(game.answer.cod)}
              />
            </>
          )}
        </div>
        <GuessInput
          answerCod={game.answer.cod}
          guesses={game.guesses}
          onGuess={submitGuess}
          pulseCod={pulseCod}
          status={game.status}
        />
      </section>
    </main>
  )
}
