const profanity = new Set([
  'asshole',
  'bitch',
  'caralho',
  'cu',
  'fuck',
  'merda',
  'porra',
  'puta',
  'puto',
  'shit',
])

export type NicknameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'control' | 'profanity' }

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0) ?? 0
    return point <= 31 || (point >= 127 && point <= 159)
  })
}

export function validateNickname(value: unknown): NicknameValidation {
  if (typeof value !== 'string') return { ok: false, reason: 'empty' }
  const trimmed = value.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (Array.from(trimmed).length > 20) return { ok: false, reason: 'too_long' }
  if (hasControlCharacter(trimmed)) return { ok: false, reason: 'control' }

  const words = trimmed
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (words.some((word) => profanity.has(word)))
    return { ok: false, reason: 'profanity' }
  return { ok: true, value: trimmed }
}
