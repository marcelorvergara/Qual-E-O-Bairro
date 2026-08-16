export function fitExplainer(raw: string, limit = 400): string | null {
  const body = raw.trim().replace(/\s+/gu, ' ')
  if (!body) return null
  const characters = Array.from(body)
  if (characters.length <= limit) return body

  const prefix = characters.slice(0, limit).join('')
  const boundaries = [...prefix.matchAll(/[.!?](?=\s|$)/gu)]
  const last = boundaries.at(-1)
  if (last?.index !== undefined) {
    return prefix.slice(0, last.index + last[0].length).trimEnd()
  }
  return `${characters
    .slice(0, limit - 1)
    .join('')
    .trimEnd()}…`
}
