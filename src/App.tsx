import { useEffect, useRef, useState } from 'react'
import * as api from './api/daily'
import { ExplainerPlaceholder } from './components/ExplainerPlaceholder'
import { GuessInput } from './components/GuessInput'
import { HintPanel } from './components/HintPanel'
import { allBairros, poolFor } from './game/data'
import {
  dailyOracle,
  deviceId,
  restoreProgress,
  saveProgress,
  verifyAnswer,
  type DailyProgress,
} from './game/daily'
import { practiceOracle } from './game/oracle'
import {
  beginRequest,
  failRequest,
  guessCount,
  newGame,
  resolveGuess,
  resolveHint,
} from './game/reducer'
import { shareText } from './game/share'
import type { Bairro, GameState, Oracle, PoolName } from './game/types'
import { BairroMap } from './map/BairroMap'
import styles from './App.module.css'

const knownCodes = new Set(poolFor('conhecidos').map(({ cod }) => cod))
const bairrosByCode = new Map(allBairros.map((bairro) => [bairro.cod, bairro]))
const hintExplanationKey = 'hint-ranking-explanation-seen'

export default function App() {
  const [mode, setMode] = useState<'daily' | 'practice'>('daily')
  const [game, setGame] = useState(() => newGame('conhecidos'))
  const [dailyMeta, setDailyMeta] = useState<api.Bootstrap | null>(null)
  const [dailyError, setDailyError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [pulseCod, setPulseCod] = useState<string>()
  const [showHintExplanation, setShowHintExplanation] = useState(false)
  const oracle = useRef<Oracle | null>(null)
  const progress = useRef<DailyProgress | null>(null)
  const gameRef = useRef(game)
  const requestPending = useRef(false)
  const submitPending = useRef(false)
  const bootstrapStarted = useRef(false)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  gameRef.current = game

  useEffect(() => {
    if (mode !== 'daily' || bootstrapStarted.current) return
    bootstrapStarted.current = true
    api
      .bootstrap()
      .then((meta) => {
        const id = deviceId()
        const restored = restoreProgress(meta.puzzleNumber, meta.puzzleDate)
        progress.current = restored?.progress ?? {
          puzzleNumber: meta.puzzleNumber,
          puzzleDate: meta.puzzleDate,
          guesses: [],
          hints: [],
          firstGuessAt: null,
          submitted: false,
        }
        oracle.current = dailyOracle(id)
        setGame(restored?.state ?? newGame('conhecidos'))
        setDailyMeta(meta)
      })
      .catch((error: unknown) =>
        setDailyError(
          error instanceof Error ? error.message : 'Modo diário indisponível.',
        ),
      )
  }, [mode])

  useEffect(() => () => clearTimeout(pulseTimer.current), [])

  const startPractice = (pool: PoolName = 'conhecidos') => {
    oracle.current = practiceOracle(pool)
    setMode('practice')
    setGame(newGame(pool))
    setNotice('')
  }
  const returnToDaily = () => {
    if (!dailyMeta) return
    const restored = restoreProgress(
      dailyMeta.puzzleNumber,
      dailyMeta.puzzleDate,
    )
    oracle.current = dailyOracle(deviceId())
    setGame(restored?.state ?? newGame('conhecidos'))
    setMode('daily')
    setNotice('')
  }
  const persist = (next: GameState, changes: Partial<DailyProgress> = {}) => {
    if (mode !== 'daily' || !progress.current) return
    progress.current = {
      ...progress.current,
      guesses: next.guesses,
      hints: next.hintTexts,
      answer: next.answer ?? undefined,
      ...changes,
    }
    saveProgress(progress.current)
  }
  const submitResult = async (next: GameState) => {
    const saved = progress.current
    if (!saved || saved.submitted || submitPending.current) return
    submitPending.current = true
    try {
      await api.submit({
        puzzleDate: saved.puzzleDate,
        deviceId: deviceId(),
        guesses: next.guesses.map(({ cod, km, adjacent }) => ({
          cod,
          km,
          adjacent,
        })),
        hints: next.hintsUsed,
        elapsedSeconds: Math.max(
          1,
          Math.floor((Date.now() - (saved.firstGuessAt ?? Date.now())) / 1000),
        ),
      })
      saved.submitted = true
      saveProgress(saved)
      setNotice('Resultado enviado.')
    } catch (error) {
      if (api.isAlreadySubmitted(error)) {
        saved.submitted = true
        saveProgress(saved)
        setNotice('Resultado já enviado.')
      } else {
        setNotice(
          error instanceof Error ? error.message : 'Falha ao enviar resultado.',
        )
      }
    } finally {
      submitPending.current = false
    }
  }
  const submitGuess = async (bairro: Bairro) => {
    const current = gameRef.current
    if (!oracle.current || requestPending.current || current.status === 'won')
      return
    if (current.guesses.some(({ cod }) => cod === bairro.cod)) return
    requestPending.current = true
    const waiting = beginRequest(current)
    gameRef.current = waiting
    setGame(waiting)
    const firstGuessAt = progress.current?.firstGuessAt ?? Date.now()
    try {
      const result = await oracle.current.evaluate(bairro.cod)
      if (
        mode === 'daily' &&
        result.correct &&
        dailyMeta &&
        !(await verifyAnswer(dailyMeta.salt, bairro.cod, dailyMeta.answerHash))
      ) {
        throw new Error('A resposta recebida não passou pela verificação.')
      }
      if (result.correct && !result.answer)
        throw new Error('Resposta incompleta do servidor.')
      const next = resolveGuess(waiting, bairro.cod, result)
      gameRef.current = next
      setGame(next)
      persist(next, { firstGuessAt })
      if (next.status === 'won' && mode === 'daily') void submitResult(next)
    } catch (error) {
      const failed = failRequest(
        waiting,
        error instanceof Error ? error.message : 'Palpite não registrado.',
      )
      gameRef.current = failed
      setGame(failed)
    } finally {
      requestPending.current = false
    }
  }
  const revealHint = async () => {
    const current = gameRef.current
    if (!oracle.current || requestPending.current || current.hintsUsed === 3)
      return
    requestPending.current = true
    const waiting = beginRequest(current)
    gameRef.current = waiting
    setGame(waiting)
    try {
      const text = await oracle.current.hint(
        (current.hintsUsed + 1) as 1 | 2 | 3,
      )
      const next = resolveHint(waiting, text)
      gameRef.current = next
      setGame(next)
      persist(next)
      let seen = false
      try {
        seen = Boolean(sessionStorage.getItem(hintExplanationKey))
        if (!seen) sessionStorage.setItem(hintExplanationKey, '1')
      } catch {
        // Storage can be unavailable in privacy modes; the hint still succeeds.
      }
      if (!seen) {
        setShowHintExplanation(true)
      }
    } catch (error) {
      const failed = failRequest(
        waiting,
        error instanceof Error ? error.message : 'Dica não revelada.',
      )
      gameRef.current = failed
      setGame(failed)
    } finally {
      requestPending.current = false
    }
  }
  const share = async () => {
    if (!dailyMeta) return
    const text = shareText(dailyMeta.puzzleNumber, game.guesses, game.hintsUsed)
    const shareApi = (
      navigator as unknown as {
        share?: (data: { text: string }) => Promise<void>
      }
    ).share
    try {
      if (shareApi) await shareApi.call(navigator, { text })
      else await navigator.clipboard.writeText(text)
      setNotice(shareApi ? 'Compartilhado!' : 'Resultado copiado!')
    } catch {
      setNotice('Não foi possível compartilhar.')
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

  const dailyUnavailable = mode === 'daily' && dailyError
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
                disabled={!dailyMeta || game.pending}
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
              {dailyMeta && mode === 'daily'
                ? `#${dailyMeta.puzzleNumber} · `
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
          {!dailyMeta && !dailyError && mode === 'daily' && (
            <p className={styles.message}>Carregando desafio diário…</p>
          )}
          {dailyUnavailable && (
            <p className={styles.message} role="alert">
              {dailyError}{' '}
              <button onClick={() => startPractice()} type="button">
                Jogar no modo prática
              </button>
            </p>
          )}
          {game.error && (
            <p className={styles.message} role="alert">
              {game.error}
            </p>
          )}
          {notice && (
            <p className={styles.message} role="status">
              {notice}
            </p>
          )}
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
                  <button onClick={share} type="button">
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
              <ExplainerPlaceholder
                bairro={game.answer}
                className={styles.explainer}
                known={knownCodes.has(game.answer.cod)}
              />
            </>
          )}
        </div>
        <GuessInput
          disabled={
            game.pending ||
            Boolean(dailyUnavailable) ||
            (mode === 'daily' && !dailyMeta)
          }
          guesses={game.guesses}
          onGuess={submitGuess}
          pulseCod={pulseCod}
          status={game.status}
        />
      </section>
    </main>
  )
}
