export type PoolName = 'conhecidos' | 'todos'
export type Bucket = 0 | 'encosta' | 1 | 2 | 3 | 4 | 5

export interface Bairro {
  cod: string
  nome: string
  rp: string
}

export interface Guess {
  cod: string
  km: number
  adjacent: boolean
  bucket: Bucket
}

export interface Hints {
  region: string
  character: string
  giveaway: string
}

export interface Evaluation {
  km: number
  adjacent: boolean
  correct: boolean
  answer?: Bairro
}

export interface Oracle {
  mode: 'practice' | 'daily'
  evaluate(cod: string): Promise<Evaluation>
  hint(tier: 1 | 2 | 3): Promise<string>
}

export type HintCount = 0 | 1 | 2 | 3

export interface GameState {
  answer: Bairro | null
  guesses: Guess[]
  status: 'playing' | 'won'
  pool: PoolName
  hintsUsed: HintCount
  hintTexts: string[]
  pending: boolean
  error: string | null
}
