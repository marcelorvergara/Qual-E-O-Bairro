import { useCallback, useEffect, useRef, useState } from 'react'
import {
  trackGameStart,
  trackGuess,
  trackHintUsed,
  trackShare,
  trackWin,
} from '../analytics'
import * as api from '../api/daily'
import {
  dailyOracle,
  deviceId,
  restoreServerProgress,
  saveProgress,
  type DailyProgress,
} from '../game/daily'
import {
  beginRequest,
  failRequest,
  guessCount,
  newGame,
  resolveGuess,
  resolveHint,
  score,
} from '../game/reducer'
import { loadExplainer, saveExplainer } from '../game/explainer'
import { shareText } from '../game/share'
import { loadStats, recordWin, saveStats } from '../game/stats'
import type { Bairro, GameState, Oracle } from '../game/types'
import { localizedError, useLanguage } from '../i18n'

const NICKNAME_KEY = 'qeb:nickname:v1'

function storedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY)?.slice(0, 20) ?? ''
  } catch {
    return ''
  }
}

export function useDaily() {
  const { text } = useLanguage()
  const [game, setGame] = useState(() => newGame('conhecidos'))
  const [meta, setMeta] = useState<api.Bootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [leaderboard, setLeaderboard] = useState<
    api.Leaderboard & {
      loading: boolean
      error: string | null
    }
  >({ entries: [], total: 0, loading: false, error: null })
  const [nickname, setNickname] = useState(storedNickname)
  const [nicknamePending, setNicknamePending] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [stats, setStats] = useState(loadStats)
  const [explainer, setExplainer] = useState<string | null>(null)
  const [submittedPuzzle, setSubmittedPuzzle] = useState<string | null>(null)
  const oracle = useRef<Oracle | null>(null)
  const progress = useRef<DailyProgress | null>(null)
  const gameRef = useRef(game)
  const requestPending = useRef(false)
  const submitPending = useRef(false)
  const bootstrapStarted = useRef(false)
  const metaRef = useRef(meta)
  const nicknameRef = useRef(nickname)
  const leaderboardPending = useRef(false)
  const leaderboardLoadedFor = useRef<string | null>(null)
  const explainerLoadedFor = useRef<string | null>(null)
  const textRef = useRef(text)
  const trackedStart = useRef<number | null>(null)
  gameRef.current = game
  metaRef.current = meta
  nicknameRef.current = nickname
  textRef.current = text

  const restore = useCallback((currentMeta: api.Bootstrap) => {
    const restored = restoreServerProgress(currentMeta)
    progress.current = restored.progress
    setSubmittedPuzzle(
      progress.current.submitted ? currentMeta.puzzleDate : null,
    )
    oracle.current = dailyOracle(deviceId())
    setGame(restored.state)
  }, [])

  useEffect(() => {
    if (bootstrapStarted.current) return
    bootstrapStarted.current = true
    setError(null)
    api
      .bootstrap(deviceId())
      .then((currentMeta) => {
        metaRef.current = currentMeta
        restore(currentMeta)
        setMeta(currentMeta)
      })
      .catch((caught: unknown) => {
        const copy = textRef.current
        setError(localizedError(caught, copy, copy.errors.DAILY_UNAVAILABLE))
      })
  }, [bootstrapAttempt, restore])

  useEffect(() => {
    if (
      !meta ||
      game.status === 'won' ||
      trackedStart.current === meta.puzzleNumber
    )
      return
    trackedStart.current = meta.puzzleNumber
    trackGameStart('daily')
  }, [game.status, meta])

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
    setLeaderboard({ entries: [], total: 0, loading: false, error: null })
    leaderboardLoadedFor.current = null
    explainerLoadedFor.current = null
    setExplainer(null)
    setSubmittedPuzzle(null)
    setBootstrapAttempt((attempt) => attempt + 1)
  }
  const resume = async () => {
    if (!meta) return
    try {
      restore(meta)
    } catch (caught) {
      setError(localizedError(caught, text, text.errors.DAILY_UNAVAILABLE))
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

  const loadLeaderboard = useCallback(async (force = false) => {
    const currentMeta = metaRef.current
    if (!currentMeta || leaderboardPending.current) return
    if (!force && leaderboardLoadedFor.current === currentMeta.puzzleDate)
      return
    leaderboardLoadedFor.current = currentMeta.puzzleDate
    leaderboardPending.current = true
    setLeaderboard((current) => ({
      ...current,
      loading: true,
      error: null,
    }))
    try {
      const result = await api.leaderboard(deviceId())
      setLeaderboard({ ...result, loading: false, error: null })
    } catch (caught) {
      setLeaderboard((current) => ({
        ...current,
        loading: false,
        error: localizedError(
          caught,
          textRef.current,
          textRef.current.errors.LEADERBOARD_LOAD,
        ),
      }))
    } finally {
      leaderboardPending.current = false
    }
  }, [])

  const submitResult = useCallback(async () => {
    const saved = progress.current
    if (!saved || saved.submitted || submitPending.current) return
    submitPending.current = true
    try {
      await api.submit({
        puzzleDate: saved.puzzleDate,
        deviceId: deviceId(),
        ...(nicknameRef.current.trim()
          ? { nickname: nicknameRef.current.trim() }
          : {}),
      })
      saved.submitted = true
      saveProgress(saved)
      setSubmittedPuzzle(saved.puzzleDate)
      setNotice(textRef.current.resultSent)
    } catch (caught) {
      if (api.isAlreadySubmitted(caught)) {
        saved.submitted = true
        saveProgress(saved)
        setSubmittedPuzzle(saved.puzzleDate)
        setNotice(textRef.current.resultAlreadySent)
      } else {
        const copy = textRef.current
        const message = localizedError(caught, copy, copy.errors.RESULT_SEND)
        setNotice(`${message} ${copy.retryNextVisit}`)
      }
    } finally {
      submitPending.current = false
      void loadLeaderboard()
    }
  }, [loadLeaderboard])

  useEffect(() => {
    if (meta && game.status === 'won' && !progress.current?.submitted) {
      void submitResult()
    }
  }, [game, meta, submitResult])

  useEffect(() => {
    if (meta && game.status === 'won' && progress.current?.submitted) {
      void loadLeaderboard()
    }
  }, [game.status, loadLeaderboard, meta])

  useEffect(() => {
    const answer = game.answer
    if (
      !meta ||
      !answer ||
      game.status !== 'won' ||
      submittedPuzzle !== meta.puzzleDate ||
      explainerLoadedFor.current === answer.cod
    ) {
      return
    }
    explainerLoadedFor.current = answer.cod
    const cached = loadExplainer(answer.cod)
    if (cached) {
      setExplainer(cached)
      return
    }
    api
      .explainer(deviceId())
      .then((result) => {
        if (!result.available) return
        saveExplainer(answer.cod, result.body)
        setExplainer(result.body)
      })
      .catch(() => {
        // The post-win explainer is optional and fails invisibly.
      })
  }, [game.answer, game.status, meta, submittedPuzzle])

  useEffect(() => {
    if (!meta || game.status !== 'won') return
    const stored = loadStats()
    const next = recordWin(stored, meta.puzzleNumber, score(game))
    if (next !== stored) saveStats(next)
    setStats(next)
  }, [game, meta])

  const saveNickname = async () => {
    if (nicknamePending) return
    setNicknamePending(true)
    setNicknameError(null)
    try {
      const saved = await api.updateNickname(deviceId(), nickname)
      setNickname(saved)
      nicknameRef.current = saved
      try {
        localStorage.setItem(NICKNAME_KEY, saved)
      } catch {
        // The server update still succeeds when storage is unavailable.
      }
      setNotice(text.nicknameSaved)
      await loadLeaderboard(true)
    } catch (caught) {
      setNicknameError(localizedError(caught, text, text.errors.NICKNAME_SAVE))
    } finally {
      setNicknamePending(false)
    }
  }

  const submitGuess = async (bairro: Bairro) => {
    const current = gameRef.current
    if (!oracle.current || requestPending.current || current.status === 'won')
      return
    if (current.guesses.some(({ cod }) => cod === bairro.cod)) {
      setNotice(text.alreadyGuessed)
      return
    }
    requestPending.current = true
    const waiting = beginRequest(current)
    gameRef.current = waiting
    setGame(waiting)
    const firstGuessAt = progress.current?.firstGuessAt ?? Date.now()
    try {
      const result = await oracle.current.evaluate(bairro.cod)
      if (result.correct && !result.answer)
        throw new Error(text.errors.ANSWER_INCOMPLETE)
      const next = resolveGuess(waiting, bairro.cod, result)
      gameRef.current = next
      setGame(next)
      persist(next, { firstGuessAt })
      const count = guessCount(next)
      trackGuess('daily', count, metaRef.current?.puzzleNumber)
      if (next.status === 'won')
        trackWin('daily', count, metaRef.current?.puzzleNumber)
    } catch (caught) {
      const failed = failRequest(
        waiting,
        localizedError(caught, text, text.errors.GUESS_FAILED),
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
      trackHintUsed('daily', metaRef.current?.puzzleNumber)
      return true
    } catch (caught) {
      const failed = failRequest(
        waiting,
        localizedError(caught, text, text.errors.HINT_FAILED),
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
    trackShare('daily', meta.puzzleNumber)
    const shareCopy = shareText(meta.puzzleNumber, game.guesses, game.hintsUsed)
    const shareApi = (
      navigator as unknown as {
        share?: (data: { text: string }) => Promise<void>
      }
    ).share
    try {
      if (shareApi) await shareApi.call(navigator, { text: shareCopy })
      else await navigator.clipboard.writeText(shareCopy)
      setNotice(shareApi ? text.shared : text.copied)
    } catch {
      setNotice(text.shareFailed)
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
    leaderboard,
    refreshLeaderboard: () => loadLeaderboard(true),
    nickname,
    setNickname,
    nicknamePending,
    nicknameError,
    saveNickname,
    stats,
    currentScore: score(game),
    explainer,
  }
}
