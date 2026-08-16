const PREFIX = 'qeb:explainer:'

export function explainerKey(cod: string): string {
  return `${PREFIX}${cod}:v1`
}

export function loadExplainer(
  cod: string,
  storage: Storage = localStorage,
): string | null {
  const key = explainerKey(cod)
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null') as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'body' in parsed &&
      typeof parsed.body === 'string' &&
      parsed.body.trim()
    ) {
      return parsed.body
    }
    if (storage.getItem(key) !== null) storage.removeItem(key)
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // Storage can reject reads and cleanup in privacy modes.
    }
  }
  return null
}

export function saveExplainer(
  cod: string,
  body: string,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(explainerKey(cod), JSON.stringify({ body }))
  } catch {
    // The explainer still renders when storage is unavailable.
  }
}
