import type { Bucket, Guess } from './types'
import { strings, type Language } from '../i18n'

const glyph: Record<Bucket, string> = {
  5: '🟫',
  4: '🟥',
  3: '🟧',
  2: '🟨',
  1: '🟩',
  encosta: '🟪',
  0: '🎯',
}

export function shareText(
  puzzleNumber: number,
  guesses: Pick<Guess, 'bucket'>[],
  hints: number,
  language: Language = 'pt-BR',
): string {
  const text = strings[language]
  const hintLabel = hints ? `, ${text.hintCount(hints)}` : ''
  return `${text.title} #${puzzleNumber}\n${guesses.map(({ bucket }) => glyph[bucket]).join('')} ${text.guessCount(guesses.length)}${hintLabel}\nhttps://qualeobairro.com.br`
}
