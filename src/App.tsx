import { useState } from 'react'
import { GuessInput } from './components/GuessInput'
import { guess, guessCount, newGame, reset } from './game/reducer'
import type { Bairro, PoolName } from './game/types'
import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

export default function App() {
  const [game, setGame] = useState(() => newGame('conhecidos'))
  const submitGuess = (bairro: Bairro) =>
    setGame((state) => guess(state, bairro.cod))
  const startPool = (pool: PoolName) => setGame(newGame(pool))

  return (
    <main className={styles.app}>
      <BairroMap answerCod={game.answer.cod} guesses={game.guesses} />
      <section className={styles.gamePanel} aria-label="Área de palpites">
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
          <span>{guessCount(game)} palpites</span>
          <button
            className={styles.newGame}
            onClick={() => setGame(reset(game))}
            type="button"
          >
            Novo jogo
          </button>
        </div>
        <div className={styles.hintPlaceholder} aria-hidden="true" />
        {game.status === 'won' && (
          <div className={styles.winBanner} role="status">
            <span>
              <strong>{game.answer.nome}</strong> · {game.answer.rp} ·{' '}
              {guessCount(game)} palpites
            </span>
            <button onClick={() => setGame(reset(game))} type="button">
              Jogar de novo
            </button>
          </div>
        )}
        <GuessInput
          guesses={game.guesses}
          onGuess={submitGuess}
          won={game.status === 'won'}
        />
      </section>
    </main>
  )
}
