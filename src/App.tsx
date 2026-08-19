import { useEffect, useRef, useState } from 'react'
import {
  trackGameStart,
  trackGuess,
  trackHintUsed,
  trackShare,
  trackWin,
} from './analytics'
import { ConsentBanner } from './components/ConsentBanner'
import { ExplainerPlaceholder } from './components/ExplainerPlaceholder'
import { GuessInput } from './components/GuessInput'
import { HintPanel } from './components/HintPanel'
import { StatsPanel } from './components/StatsPanel'
import { useDaily } from './daily/useDaily'
import { allBairros, poolFor } from './game/data'
import { formatElapsed, partitionEntries } from './game/leaderboard'
import { practiceOracle } from './game/oracle'
import { shouldShowHintExplanation } from './game/presentation'
import { practiceShareText } from './game/share'
import {
  beginRequest,
  failRequest,
  guessCount,
  newGame,
  resolveGuess,
  resolveHint,
} from './game/reducer'
import type { Bairro, Oracle, PoolName } from './game/types'
import { LanguageToggle, localizedError, useLanguage } from './i18n'
import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

const knownCodes = new Set(poolFor('conhecidos').map(({ cod }) => cod))
const bairrosByCode = new Map(allBairros.map((bairro) => [bairro.cod, bairro]))
const hintExplanationKey = 'hint-ranking-explanation-seen'

export default function App() {
  const { text } = useLanguage()
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
    trackGameStart('practice')
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
      setPracticeNotice(text.alreadyGuessed)
      return
    }
    practicePending.current = true
    const waiting = beginRequest(current)
    practiceGameRef.current = waiting
    setPracticeGame(waiting)
    try {
      const result = await practice.current.evaluate(bairro.cod)
      if (result.correct && !result.answer)
        throw new Error(text.errors.ANSWER_INCOMPLETE)
      const next = resolveGuess(waiting, bairro.cod, result)
      practiceGameRef.current = next
      setPracticeGame(next)
      const count = guessCount(next)
      trackGuess('practice', count)
      if (next.status === 'won') trackWin('practice', count)
    } catch (error) {
      const failed = failRequest(
        waiting,
        localizedError(error, text, text.errors.GUESS_FAILED),
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
      trackHintUsed('practice')
      return true
    } catch (error) {
      const failed = failRequest(
        waiting,
        localizedError(error, text, text.errors.HINT_FAILED),
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
    if (!shouldShowHintExplanation(mode, true)) return
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
  const sharePractice = async () => {
    const shareCopy = practiceShareText(
      practiceGame.guesses,
      practiceGame.hintsUsed,
    )
    const shareApi = (
      navigator as unknown as {
        share?: (data: { text: string }) => Promise<void>
      }
    ).share
    trackShare('practice')
    try {
      if (shareApi) await shareApi.call(navigator, { text: shareCopy })
      else await navigator.clipboard.writeText(shareCopy)
      setPracticeNotice(shareApi ? text.shared : text.copied)
    } catch {
      setPracticeNotice(text.shareFailed)
    }
  }

  const dailyUnavailable = mode === 'daily' && daily.error
  const ranking = partitionEntries(daily.leaderboard.entries)
  const rankingRows = ranking.selfOutside
    ? [...ranking.top, ranking.selfOutside]
    : ranking.top
  return (
    <main className={styles.app}>
      <ConsentBanner />
      <LanguageToggle className={styles.languageToggle} />
      <BairroMap
        guesses={game.guesses}
        pulseCod={pulseCod}
        status={game.status}
      />
      <footer className={styles.attribution}>
        <span>{text.attribution}</span>
        <a href="https://mvergara.net" rel="noreferrer" target="_blank">
          {text.portfolio}
        </a>
      </footer>
      <section className={styles.gamePanel} aria-label={text.guessesArea}>
        <div className={styles.panelContent}>
          <div className={styles.guessStrip} aria-label={text.guessHistory}>
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
                    ? text.adjacent
                    : `${item.km.toFixed(1)} km`}
              </button>
            ))}
          </div>
          <div className={styles.controls}>
            <div className={styles.segmented} aria-label={text.gameMode}>
              <button
                aria-pressed={mode === 'daily'}
                disabled={!daily.meta || game.pending}
                onClick={returnToDaily}
                type="button"
              >
                {text.daily}
              </button>
              <button
                aria-pressed={mode === 'practice'}
                disabled={game.pending}
                onClick={() => startPractice()}
                type="button"
              >
                {text.practice}
              </button>
            </div>
            <span className={styles.scoreCount}>
              {daily.meta && mode === 'daily'
                ? `#${daily.meta.puzzleNumber} · `
                : ''}
              {text.guessCount(guessCount(game))}
              {game.hintsUsed > 0 && ` · ${text.hintCount(game.hintsUsed)}`}
            </span>
            {mode === 'practice' && (
              <div className={styles.segmented} aria-label={text.poolSelection}>
                {(['conhecidos', 'todos'] as const).map((pool) => (
                  <button
                    aria-pressed={game.pool === pool}
                    disabled={game.pending}
                    key={pool}
                    onClick={() => startPractice(pool)}
                    type="button"
                  >
                    {pool === 'conhecidos' ? text.known : text.all}
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
              {text.hint} ({3 - game.hintsUsed})
            </button>
            {mode === 'practice' && (
              <button
                className={styles.newGame}
                onClick={() => startPractice(game.pool)}
                type="button"
              >
                {text.newGame}
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
              text.loadingDaily}
            {dailyUnavailable && (
              <>
                <span>{daily.error}</span>
                <button onClick={daily.retry} type="button">
                  {text.retry}
                </button>
                <button onClick={() => startPractice()} type="button">
                  {text.playPractice}
                </button>
              </>
            )}
            {!dailyUnavailable && (game.error || notice)}
          </div>
          <HintPanel
            texts={game.hintTexts}
            onDismissExplanation={() => setShowHintExplanation(false)}
            showExplanation={shouldShowHintExplanation(
              mode,
              showHintExplanation,
            )}
            used={game.hintsUsed}
          />
          {game.status === 'won' && game.answer && (
            <>
              <div className={styles.winBanner} role="status">
                <span>
                  <strong>{game.answer.nome}</strong> · {game.answer.rp} ·{' '}
                  {text.guessCount(guessCount(game))}
                </span>
                {mode === 'daily' ? (
                  <button onClick={daily.share} type="button">
                    {text.share}
                  </button>
                ) : (
                  <div className={styles.winActions}>
                    <button onClick={sharePractice} type="button">
                      {text.share}
                    </button>
                    <button
                      onClick={() => startPractice(game.pool)}
                      type="button"
                    >
                      {text.playAgain}
                    </button>
                  </div>
                )}
              </div>
              {mode === 'daily' ? (
                <div className={styles.winDetails}>
                  <section
                    aria-label={text.todayRanking}
                    className={styles.leaderboard}
                  >
                    <form
                      className={styles.nickname}
                      onSubmit={(event) => {
                        event.preventDefault()
                        void daily.saveNickname()
                      }}
                    >
                      <label htmlFor="daily-nickname">{text.nickname}</label>
                      <input
                        id="daily-nickname"
                        maxLength={20}
                        onChange={(event) =>
                          daily.setNickname(event.target.value)
                        }
                        placeholder={text.optional}
                        value={daily.nickname}
                      />
                      <button disabled={daily.nicknamePending} type="submit">
                        {daily.nicknamePending ? text.saving : text.save}
                      </button>
                    </form>
                    {daily.nicknameError && (
                      <p className={styles.leaderboardError} role="alert">
                        {daily.nicknameError}
                      </p>
                    )}
                    <div className={styles.leaderboardHeading}>
                      <strong>{text.ranking}</strong>
                      <span>
                        {text.participantCount(daily.leaderboard.total)}
                      </span>
                      <button
                        disabled={daily.leaderboard.loading}
                        onClick={daily.refreshLeaderboard}
                        type="button"
                      >
                        {text.refresh}
                      </button>
                    </div>
                    {daily.leaderboard.loading && <p>{text.loadingRanking}</p>}
                    {daily.leaderboard.error && (
                      <p className={styles.leaderboardError} role="alert">
                        {daily.leaderboard.error}
                      </p>
                    )}
                    {!daily.leaderboard.loading &&
                      !daily.leaderboard.error &&
                      rankingRows.length === 0 && <p>{text.emptyRanking}</p>}
                    {rankingRows.length > 0 && (
                      <ol className={styles.rankingList}>
                        {rankingRows.map((entry) => (
                          <li
                            className={`${entry.isSelf ? styles.selfRank : ''} ${entry.position > 50 ? styles.outsideRank : ''}`}
                            key={`${entry.position}-${entry.nickname}-${entry.elapsedSeconds}`}
                          >
                            <strong>#{entry.position}</strong>
                            <span>{entry.nickname || text.anonymous}</span>
                            <span>
                              {entry.score} {text.points}
                            </span>
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
                      aria-label={text.aboutBairro}
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
          notice={notice}
          onGuess={mode === 'daily' ? daily.submitGuess : submitPracticeGuess}
          pulseCod={pulseCod}
          status={game.status}
          unavailable={Boolean(dailyUnavailable)}
        />
      </section>
    </main>
  )
}
