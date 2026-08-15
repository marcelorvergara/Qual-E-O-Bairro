import type { Bairro } from '../game/types'

interface ExplainerPlaceholderProps {
  bairro: Bairro
  known: boolean
  className: string
}

// TODO(phase-3): replace ExplainerPlaceholder with BairroExplainer backed by Supabase.
export function ExplainerPlaceholder({
  bairro,
  known,
  className,
}: ExplainerPlaceholderProps) {
  return (
    <section className={className} aria-label="Sobre o bairro">
      {bairro.nome} fica na RP {bairro.rp}
      {known ? ' e é um bairro conhecido.' : '.'}
    </section>
  )
}
