import type { Bairro } from '../game/types'
import { useLanguage } from '../i18n'

interface ExplainerPlaceholderProps {
  bairro: Bairro
  known: boolean
  className: string
}

// This is the lightweight post-win summary when no generated explainer is available.
export function ExplainerPlaceholder({
  bairro,
  known,
  className,
}: ExplainerPlaceholderProps) {
  const { text } = useLanguage()
  return (
    <section className={className} aria-label={text.aboutBairro}>
      {text.bairroLocation(bairro.nome, bairro.rp)}
      {known ? text.knownBairro : '.'}
    </section>
  )
}
