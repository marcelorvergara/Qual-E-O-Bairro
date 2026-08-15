import { describe, expect, it } from 'vitest'
import poolJson from '../../data/pool.json'
import { bucketFor } from './buckets'
import { allBairros, HINT_ORDER, hintsFor, poolFor } from './data'
import { matchBairros } from './normalize'
import { guess, newGame, score, useHint } from './reducer'

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
  it('ignores repeated guesses and detects a win', () => {
    const started = newGame('conhecidos', () => 0)
    const wrongCod = poolFor('conhecidos')[1].cod
    const once = guess(started, wrongCod)
    expect(guess(once, wrongCod)).toBe(once)
    expect(guess(once, started.answer.cod).status).toBe('won')
  })

  it('builds the configured pools', () => {
    expect(poolFor('todos').map(({ nome }) => nome)).not.toContain('Argentino')
    expect(poolFor('conhecidos').map(({ cod }) => cod)).toEqual(poolJson.codes)
  })

  it('reveals hint tiers in region, character, giveaway order', () => {
    const state = newGame('conhecidos', () => 0)
    const hints = hintsFor(state.answer.cod)
    expect(HINT_ORDER).toEqual(['region', 'character', 'giveaway'])
    expect(HINT_ORDER.map((key) => hints[key])).toEqual([
      hints.region,
      hints.character,
      hints.giveaway,
    ])
    expect(useHint(useHint(useHint(state))).hintsUsed).toBe(3)
  })

  it('caps hints at three', () => {
    const state = newGame('conhecidos', () => 0)
    const capped = useHint(useHint(useHint(state)))
    expect(useHint(capped)).toBe(capped)
  })

  it('ignores hints after a win', () => {
    const state = newGame('conhecidos', () => 0)
    const won = guess(state, state.answer.cod)
    expect(useHint(won)).toBe(won)
  })

  it('adds hints to the future ranking score', () => {
    const state = newGame('conhecidos', () => 0)
    const guessed = guess(state, poolFor('conhecidos')[1].cod)
    expect(score(useHint(useHint(guessed)))).toBe(3)
  })
})
