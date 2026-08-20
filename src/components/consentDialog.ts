import type { ConsentChoice } from '../analytics'

export function dismissReopenedConsent(
  choice: ConsentChoice,
  onClose: () => void,
) {
  if (choice) onClose()
}
