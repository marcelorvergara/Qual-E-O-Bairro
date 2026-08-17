import type { Bucket, Guess } from './types'

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
): string {
  const guessLabel = `${guesses.length} ${guesses.length === 1 ? 'palpite' : 'palpites'}`
  const hintLabel = hints ? `, ${hints} ${hints === 1 ? 'dica' : 'dicas'}` : ''
  return `Qual é o Bairro? #${puzzleNumber}\n${guesses.map(({ bucket }) => glyph[bucket]).join('')} ${guessLabel}${hintLabel}\nhttps://qualeobairro.com.br`
}

export function practiceShareText(
  guesses: Pick<Guess, 'bucket'>[],
  hints: number,
): string {
  const guessLabel = `${guesses.length} ${guesses.length === 1 ? 'palpite' : 'palpites'}`
  const hintLabel = hints ? `, ${hints} ${hints === 1 ? 'dica' : 'dicas'}` : ''
  return `Qual é o Bairro? — Prática\n${guesses.map(({ bucket }) => glyph[bucket]).join('')} ${guessLabel}${hintLabel}\nhttps://qualeobairro.com.br`
}
