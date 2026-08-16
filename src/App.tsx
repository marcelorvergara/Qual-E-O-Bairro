import { useEffect, useRef, useState } from 'react'
import { ExplainerPlaceholder } from './components/ExplainerPlaceholder'
import { GuessInput } from './components/GuessInput'
import { HintPanel } from './components/HintPanel'
import { StatsPanel } from './components/StatsPanel'
import { useDaily } from './daily/useDaily'
import { allBairros, poolFor } from './game/data'
import { formatElapsed, partitionEntries } from './game/leaderboard'
import { practiceOracle } from './game/oracle'
import {
  beginRequest,
  failRequest,
  guessCount,
  newGame,
  resolveGuess,
  resolveHint,
} from './game/reducer'
import type { Bairro, Oracle, PoolName } from './game/types'
import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

const knownCodes = new Set(poolFor('conhecidos').map(({ cod }) => cod))
const bairrosByCode = new Map(allBairros.map((bairro) => [bairro.cod, bairro]))
const hintExplanationKey = 'hint-ranking-explanation-seen'

export default function App() {
  const [mode, setMode] = useState<'daily' | 'practice'>('daily')
  const daily = useDaily()
  const [practiceGame, setPracticeGame] = useState(() => newGame('conhecidos'))
  const [practiceNotice, setPracticeNotice] = useState('')
  const [pulseCod, setPulseCod] = useState<string>()
  const [showHintExplanation, setShowHintExplanation] = useState(false)
  const practice = useRef<Oracle>(practiceOracle('conhecidos'))
  const practiceGameRef = useRef(practiceGame)
  const practicePending = useRef(false)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const game = mode === 'daily' ? daily.game : practiceGame
  const notice = mode === 'daily' ? daily.notice : practiceNotice
  practiceGameRef.current = practiceGame

  useEffect(() => () => clearTimeout(pulseTimer.current), [])
  useEffect(() => {
    if (!practiceNotice) return
    const timer = setTimeout(() => setPracticeNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [practiceNotice])

  const startPractice = (pool: PoolName = 'conhecidos') => {
    practice.current = practiceOracle(pool)
    setMode('practice')
    setPracticeGame(newGame(pool))
    setPracticeNotice('')
  }
  const returnToDaily = () => {
    if (!daily.meta) return
    setMode('daily')
    void daily.resume()
  }
  const submitPracticeGuess = async (bairro: Bairro) => {
    const current = practiceGameRef.current
    if (practicePending.current || current.status === 'won') return
    if (current.guesses.some(({ cod }) => cod === bairro.cod)) {
      setPracticeNotice('Você já tentou esse bairro.')
      return
    }
    practicePending.current = true
    const waiting = beginRequest(current)
    practiceGameRef.current = waiting
    setPracticeGame(waiting)
    try {
      const result = await practice.current.evaluate(bairro.cod)
      if (result.correct && !result.answer)
        throw new Error('Resposta incompleta do servidor.')
      const next = resolveGuess(waiting, bairro.cod, result)
      practiceGameRef.current = next
      setPracticeGame(next)
    } catch (error) {
      const failed = failRequest(
        waiting,
        error instanceof Error ? error.message : 'Palpite não registrado.',
      )
      practiceGameRef.current = failed
      setPracticeGame(failed)
    } finally {
      practicePending.current = false
    }
  }
  const revealPracticeHint = async (): Promise<boolean> => {
    const current = practiceGameRef.current
    if (practicePending.current || current.hintsUsed === 3) return false
    practicePending.current = true
    const waiting = beginRequest(current)
    practiceGameRef.current = waiting
    setPracticeGame(waiting)
    try {
      const text = await practice.current.hint(
        (current.hintsUsed + 1) as 1 | 2 | 3,
      )
      const next = resolveHint(waiting, text)
      practiceGameRef.current = next
      setPracticeGame(next)
      return true
    } catch (error) {
      const failed = failRequest(
        waiting,
        error instanceof Error ? error.message : 'Dica não revelada.',
      )
      practiceGameRef.current = failed
      setPracticeGame(failed)
      return false
    } finally {
      practicePending.current = false
    }
  }
  const revealHint = async () => {
    const revealed =
      mode === 'daily' ? await daily.revealHint() : await revealPracticeHint()
    if (!revealed) return
    let seen = false
    try {
      seen = Boolean(sessionStorage.getItem(hintExplanationKey))
      if (!seen) sessionStorage.setItem(hintExplanationKey, '1')
    } catch {
      // Storage can be unavailable in privacy modes; the hint still succeeds.
    }
    if (!seen) setShowHintExplanation(true)
  }
  const pulse = (cod: string) => {
    clearTimeout(pulseTimer.current)
    setPulseCod(undefined)
    requestAnimationFrame(() => {
      setPulseCod(cod)
      pulseTimer.current = setTimeout(() => setPulseCod(undefined), 600)
    })
  }

  const dailyUnavailable = mode === 'daily' && daily.error
  const ranking = partitionEntries(daily.leaderboard.entries)
  const rankingRows = ranking.selfOutside
    ? [...ranking.top, ranking.selfOutside]
    : ranking.top
  return (
    <main className={styles.app}>
      <BairroMap
        guesses={game.guesses}
        pulseCod={pulseCod}
        status={game.status}
      />
      <section className={styles.gamePanel} aria-label="Área de palpites">
        <div className={styles.panelContent}>
          <div className={styles.guessStrip} aria-label="Histórico de palpites">
            {[...game.guesses].reverse().map((item) => (
              <button
                className={`${styles.chip} ${item.bucket === 'encosta' ? styles.encosta : styles[`bucket${item.bucket}`]}`}
                key={item.cod}
                onClick={() => pulse(item.cod)}
                type="button"
              >
                {bairrosByCode.get(item.cod)?.nome} ·{' '}
                {item.bucket === 0
                  ? '✓'
                  : item.bucket === 'encosta'
                    ? 'encosta'
                    : `${item.km.toFixed(1)} km`}
              </button>
            ))}
          </div>
          <div className={styles.controls}>
            <div className={styles.segmented} aria-label="Modo de jogo">
              <button
                aria-pressed={mode === 'daily'}
                disabled={!daily.meta || game.pending}
                onClick={returnToDaily}
                type="button"
              >
                Diário
              </button>
              <button
                aria-pressed={mode === 'practice'}
                disabled={game.pending}
                onClick={() => startPractice()}
                type="button"
              >
                Prática
              </button>
            </div>
            <span className={styles.scoreCount}>
              {daily.meta && mode === 'daily'
                ? `#${daily.meta.puzzleNumber} · `
                : ''}
              {guessCount(game)} palpites
              {game.hintsUsed > 0 && ` · ${game.hintsUsed} dicas`}
            </span>
            {mode === 'practice' && (
              <div
                className={styles.segmented}
                aria-label="Seleção de conjunto"
              >
                {(['conhecidos', 'todos'] as const).map((pool) => (
                  <button
                    aria-pressed={game.pool === pool}
                    disabled={game.pending}
                    key={pool}
                    onClick={() => startPractice(pool)}
                    type="button"
                  >
                    {pool === 'conhecidos' ? 'Conhecidos' : 'Todos'}
                  </button>
                ))}
              </div>
            )}
            <button
              disabled={
                game.pending ||
                game.status === 'won' ||
                game.hintsUsed === 3 ||
                Boolean(dailyUnavailable)
              }
              onClick={revealHint}
              type="button"
            >
              Dica ({3 - game.hintsUsed})
            </button>
            {mode === 'practice' && (
              <button
                className={styles.newGame}
                onClick={() => startPractice(game.pool)}
                type="button"
              >
                Novo jogo
              </button>
            )}
          </div>
          <div
            aria-live="polite"
            className={styles.feedback}
            role={dailyUnavailable || game.error ? 'alert' : 'status'}
          >
            {!daily.meta &&
              !daily.error &&
              mode === 'daily' &&
              'Carregando desafio diário…'}
            {dailyUnavailable && (
              <>
                <span>{daily.error}</span>
                <button onClick={daily.retry} type="button">
                  Tentar novamente
                </button>
                <button onClick={() => startPractice()} type="button">
                  Jogar na prática
                </button>
              </>
            )}
            {!dailyUnavailable && (game.error || notice)}
          </div>
          <HintPanel
            texts={game.hintTexts}
            onDismissExplanation={() => setShowHintExplanation(false)}
            showExplanation={showHintExplanation}
            used={game.hintsUsed}
          />
          {game.status === 'won' && game.answer && (
            <>
              <div className={styles.winBanner} role="status">
                <span>
                  <strong>{game.answer.nome}</strong> · {game.answer.rp} ·{' '}
                  {guessCount(game)} palpites
                </span>
                {mode === 'daily' ? (
                  <button onClick={daily.share} type="button">
                    Compartilhar
                  </button>
                ) : (
                  <button
                    onClick={() => startPractice(game.pool)}
                    type="button"
                  >
                    Jogar de novo
                  </button>
                )}
              </div>
              {mode === 'daily' ? (
                <div className={styles.winDetails}>
                  <section
                    aria-label="Classificação de hoje"
                    className={styles.leaderboard}
                  >
                    <form
                      className={styles.nickname}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void daily.saveNickname()
                      }}
                    >
                      <label htmlFor="daily-nickname">Seu apelido</label>
                      <input
                        id="daily-nickname"
                        maxLength={20}
                        onChange={(event) =>
                          daily.setNickname(event.target.value)
                        }
                        placeholder="Opcional"
                        value={daily.nickname}
                      />
                      <button disabled={daily.nicknamePending} type="submit">
                        {daily.nicknamePending ? 'Salvando…' : 'Salvar'}
                      </button>
                    </form>
                    {daily.nicknameError && (
                      <p className={styles.leaderboardError} role="alert">
                        {daily.nicknameError}
                      </p>
                    )}
                    <div className={styles.leaderboardHeading}>
                      <strong>Classificação</strong>
                      <span>{daily.leaderboard.total} participantes</span>
                      <button
                        disabled={daily.leaderboard.loading}
                        onClick={daily.refreshLeaderboard}
                        type="button"
                      >
                        Atualizar
                      </button>
                    </div>
                    {daily.leaderboard.loading && (
                      <p>Carregando classificação…</p>
                    )}
                    {daily.leaderboard.error && (
                      <p className={styles.leaderboardError} role="alert">
                        {daily.leaderboard.error}
                      </p>
                    )}
                    {!daily.leaderboard.loading &&
                      !daily.leaderboard.error &&
                      rankingRows.length === 0 && (
                        <p>A classificação ainda está vazia.</p>
                      )}
                    {rankingRows.length > 0 && (
                      <ol className={styles.rankingList}>
                        {rankingRows.map((entry) => (
                          <li
                            className={`${entry.isSelf ? styles.selfRank : ''} ${entry.position > 50 ? styles.outsideRank : ''}`}
                            key={`${entry.position}-${entry.nickname}-${entry.elapsedSeconds}`}
                          >
                            <strong>#{entry.position}</strong>
                            <span>{entry.nickname || 'anônimo'}</span>
                            <span>{entry.score} pts</span>
                            <time>{formatElapsed(entry.elapsedSeconds)}</time>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  <StatsPanel
                    currentScore={daily.currentScore}
                    stats={daily.stats}
                  />
                  {daily.explainer && (
                    <section
                      aria-label="Sobre o bairro"
                      className={styles.explainer}
                    >
                      {daily.explainer}
                    </section>
                  )}
                </div>
              ) : (
                <ExplainerPlaceholder
                  bairro={game.answer}
                  className={styles.explainer}
                  known={knownCodes.has(game.answer.cod)}
                />
              )}
            </>
          )}
        </div>
        <GuessInput
          disabled={
            game.pending ||
            Boolean(dailyUnavailable) ||
            (mode === 'daily' && !daily.meta)
          }
          guesses={game.guesses}
          onGuess={mode === 'daily' ? daily.submitGuess : submitPracticeGuess}
          pulseCod={pulseCod}
          status={game.status}
        />
      </section>
    </main>
  )
}
