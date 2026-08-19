import { normalizeName } from './normalize'

export function shouldShowNoResults(query: string, matchCount: number) {
  return normalizeName(query).length > 0 && matchCount === 0
}

export function shouldShowHintExplanation(
  mode: 'daily' | 'practice',
  requested: boolean,
) {
  return mode === 'daily' && requested
}
