import { describe, expect, it, vi } from 'vitest'
import poolJson from '../../data/pool.json'
import { bucketFor } from './buckets'
import { allBairros, HINT_ORDER, hintsFor, poolFor } from './data'
import { matchBairros } from './normalize'
import { practiceOracle } from './oracle'
import {
  beginRequest,
  failRequest,
  newGame,
  resolveGuess,
  resolveHint,
  score,
} from './reducer'

describe('name matching', () => {
  it.each([
    ['Sao Cristovao', 'Imperial de São Cristóvão'],
    ['graj', 'Grajaú'],
  ])('matches %s without accents', (query, expected) => {
    expect(matchBairros(query, allBairros).map(({ nome }) => nome)).toContain(
      expected,
    )
  })

  it('returns both Freguesias for the bare ambiguous name', () => {
    expect(
      matchBairros('freguesia', allBairros).map(({ nome }) => nome),
    ).toEqual(['Freguesia (Ilha)', 'Freguesia (Jacarepaguá)'])
  })
})

describe('buckets', () => {
  it.each([
    [0, false, true, 0],
    [0, false, false, 1],
    [0, true, false, 'encosta'],
    [3, false, false, 1],
    [3.1, false, false, 2],
    [7, false, false, 2],
    [7.1, false, false, 3],
    [12, false, false, 3],
    [12.1, false, false, 4],
    [20, false, false, 4],
    [20.1, false, false, 5],
  ])('classifies %s km', (km, adjacent, correct, expected) => {
    expect(
      bucketFor(km as number, adjacent as boolean, correct as boolean),
    ).toBe(expected)
  })
})

describe('game state', () => {
  it('ignores repeated resolved guesses and detects a win', async () => {
    const oracle = practiceOracle('conhecidos', () => 0)
    const started = newGame('conhecidos')
    const wrongCod = poolFor('conhecidos')[1].cod
    const once = resolveGuess(
      started,
      wrongCod,
      await oracle.evaluate(wrongCod),
    )
    expect(
      resolveGuess(once, wrongCod, await oracle.evaluate(wrongCod)).guesses,
    ).toEqual(once.guesses)
    const answerCod = poolFor('conhecidos')[0].cod
    const won = resolveGuess(once, answerCod, await oracle.evaluate(answerCod))
    expect(won.status).toBe('won')
    expect(won.answer?.cod).toBe(answerCod)
  })

  it('keeps practice evaluation fully offline', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const oracle = practiceOracle('conhecidos', () => 0)
    await oracle.evaluate(poolFor('conhecidos')[1].cod)
    await oracle.hint(1)
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('recovers after a failed request', () => {
    const failed = failRequest(beginRequest(newGame('conhecidos')), 'sem rede')
    expect(failed).toMatchObject({
      pending: false,
      error: 'sem rede',
      guesses: [],
    })
  })

  it('builds the configured pools', () => {
    expect(allBairros.map(({ nome }) => nome)).not.toContain('Argentino')
    expect(poolFor('todos').map(({ nome }) => nome)).not.toContain('Argentino')
    expect(poolFor('conhecidos').map(({ cod }) => cod)).toEqual(poolJson.codes)
  })

  it('reveals hint tiers in region, character, giveaway order', async () => {
    const oracle = practiceOracle('conhecidos', () => 0)
    const hints = hintsFor(poolFor('conhecidos')[0].cod)
    expect(HINT_ORDER).toEqual(['region', 'character', 'giveaway'])
    expect(HINT_ORDER.map((key) => hints[key])).toEqual([
      hints.region,
      hints.character,
      hints.giveaway,
    ])
    let state = newGame('conhecidos')
    for (const tier of [1, 2, 3] as const)
      state = resolveHint(state, await oracle.hint(tier))
    expect(state.hintsUsed).toBe(3)
    expect(state.hintTexts).toEqual([
      hints.region,
      hints.character,
      hints.giveaway,
    ])
    expect(resolveHint(state, 'extra').hintsUsed).toBe(3)
  })

  it('adds hints to the future ranking score', async () => {
    const oracle = practiceOracle('conhecidos', () => 0)
    const cod = poolFor('conhecidos')[1].cod
    const guessed = resolveGuess(
      newGame('conhecidos'),
      cod,
      await oracle.evaluate(cod),
    )
    expect(score(resolveHint(resolveHint(guessed, 'a'), 'b'))).toBe(3)
  })
})
