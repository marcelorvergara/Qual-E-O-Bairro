import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/daily'
import {
  dailyOracle,
  deviceId,
  restoreVerifiedProgress,
  saveProgress,
  verifyAnswer,
  type DailyProgress,
} from '../game/daily'
import {
  beginRequest,
  failRequest,
  newGame,
  resolveGuess,
  resolveHint,
} from '../game/reducer'
import { shareText } from '../game/share'
import type { Bairro, GameState, Oracle } from '../game/types'

export function useDaily() {
  const [game, setGame] = useState(() => newGame('conhecidos'))
  const [meta, setMeta] = useState<api.Bootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const oracle = useRef<Oracle | null>(null)
  const progress = useRef<DailyProgress | null>(null)
  const gameRef = useRef(game)
  const requestPending = useRef(false)
  const submitPending = useRef(false)
  const bootstrapStarted = useRef(false)
  gameRef.current = game

  const restore = useCallback(async (currentMeta: api.Bootstrap) => {
    const restored = await restoreVerifiedProgress(
      currentMeta.puzzleNumber,
      currentMeta.puzzleDate,
      currentMeta.salt,
      currentMeta.answerHash,
    )
    progress.current = restored?.progress ?? {
      puzzleNumber: currentMeta.puzzleNumber,
      puzzleDate: currentMeta.puzzleDate,
      guesses: [],
      hints: [],
      firstGuessAt: null,
      submitted: false,
    }
    oracle.current = dailyOracle(deviceId())
    setGame(restored?.state ?? newGame('conhecidos'))
  }, [])

  useEffect(() => {
    if (bootstrapStarted.current) return
    bootstrapStarted.current = true
    setError(null)
    api
      .bootstrap()
      .then(async (currentMeta) => {
        await restore(currentMeta)
        setMeta(currentMeta)
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : 'Modo diário indisponível.',
        ),
      )
  }, [bootstrapAttempt, restore])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const retry = () => {
    bootstrapStarted.current = false
    oracle.current = null
    setMeta(null)
    setError(null)
    setGame(newGame('conhecidos'))
    setBootstrapAttempt((attempt) => attempt + 1)
  }
  const resume = async () => {
    if (!meta) return
    try {
      await restore(meta)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Modo diário indisponível.',
      )
    }
  }
  const persist = (next: GameState, changes: Partial<DailyProgress> = {}) => {
    if (!progress.current) return
    progress.current = {
      ...progress.current,
      guesses: next.guesses,
      hints: next.hintTexts,
      answer: next.answer ?? undefined,
      ...changes,
    }
    saveProgress(progress.current)
  }
  const submitResult = useCallback(async (next: GameState) => {
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
    } catch (caught) {
      if (api.isAlreadySubmitted(caught)) {
        saved.submitted = true
        saveProgress(saved)
        setNotice('Resultado já enviado.')
      } else {
        const message =
          caught instanceof Error
            ? caught.message
            : 'Falha ao enviar resultado.'
        setNotice(`${message} Tentaremos novamente na próxima visita.`)
      }
    } finally {
      submitPending.current = false
    }
  }, [])

  useEffect(() => {
    if (meta && game.status === 'won' && !progress.current?.submitted) {
      void submitResult(game)
    }
  }, [game, meta, submitResult])

  const submitGuess = async (bairro: Bairro) => {
    const current = gameRef.current
    if (!oracle.current || requestPending.current || current.status === 'won')
      return
    if (current.guesses.some(({ cod }) => cod === bairro.cod)) {
      setNotice('Você já tentou esse bairro.')
      return
    }
    requestPending.current = true
    const waiting = beginRequest(current)
    gameRef.current = waiting
    setGame(waiting)
    const firstGuessAt = progress.current?.firstGuessAt ?? Date.now()
    try {
      const result = await oracle.current.evaluate(bairro.cod)
      if (
        result.correct &&
        meta &&
        !(await verifyAnswer(meta.salt, bairro.cod, meta.answerHash))
      ) {
        throw new Error('A resposta recebida não passou pela verificação.')
      }
      if (result.correct && !result.answer)
        throw new Error('Resposta incompleta do servidor.')
      const next = resolveGuess(waiting, bairro.cod, result)
      gameRef.current = next
      setGame(next)
      persist(next, { firstGuessAt })
    } catch (caught) {
      const failed = failRequest(
        waiting,
        caught instanceof Error ? caught.message : 'Palpite não registrado.',
      )
      gameRef.current = failed
      setGame(failed)
    } finally {
      requestPending.current = false
    }
  }
  const revealHint = async (): Promise<boolean> => {
    const current = gameRef.current
    if (!oracle.current || requestPending.current || current.hintsUsed === 3)
      return false
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
      return true
    } catch (caught) {
      const failed = failRequest(
        waiting,
        caught instanceof Error ? caught.message : 'Dica não revelada.',
      )
      gameRef.current = failed
      setGame(failed)
      return false
    } finally {
      requestPending.current = false
    }
  }
  const share = async () => {
    if (!meta) return
    const text = shareText(meta.puzzleNumber, game.guesses, game.hintsUsed)
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

  return {
    game,
    meta,
    error,
    notice,
    retry,
    resume,
    submitGuess,
    revealHint,
    share,
  }
}
