export const hintTiers = ['region', 'character', 'giveaway']

export function validateHints(value, nome) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${nome}: response must be a JSON object`)
  }
  for (const tier of hintTiers) {
    if (typeof value[tier] !== 'string' || !value[tier].trim()) {
      throw new Error(`${nome}: response is missing string tier “${tier}”`)
    }
  }
  return value
}

export function parseHintsResponse(content, nome) {
  const text = Array.isArray(content)
    ? content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    : String(content ?? '')

  let lastError
  for (
    let start = text.indexOf('{');
    start >= 0;
    start = text.indexOf('{', start + 1)
  ) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < text.length; index += 1) {
      const character = text[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') inString = true
      else if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            return validateHints(JSON.parse(text.slice(start, index + 1)), nome)
          } catch (error) {
            lastError = error
            break
          }
        }
      }
    }
  }

  const preview = text.replace(/\s+/g, ' ').trim().slice(0, 180)
  throw new Error(
    `${nome}: response did not contain a valid hints JSON object${lastError ? ` (${lastError.message})` : ''}. Response starts: ${JSON.stringify(preview)}`,
  )
}
