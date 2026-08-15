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

export interface GameState {
  answer: Bairro
  guesses: Guess[]
  status: 'playing' | 'won'
  pool: PoolName
}
