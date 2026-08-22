/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Language = 'pt-BR' | 'en'

const STORAGE_KEY = 'qeb:language:v1'

const ptBR = {
  title: 'Qual é o Bairro?',
  description: 'Um jogo sobre os bairros do Rio de Janeiro.',
  languageLabel: 'Idioma',
  languageButton: 'EN',
  analyticsConsentLabel: 'Preferências de privacidade',
  analyticsConsentMessage:
    'Podemos usar dados anônimos de uso para melhorar o jogo. Você pode aceitar ou recusar.',
  dailyIdentityMessage:
    'No modo Diário, guardamos um identificador anônimo neste dispositivo para manter seu resultado e limitar participações no ranking.',
  rejectAnalytics: 'Recusar',
  acceptAnalytics: 'Aceitar',
  attribution: 'Dados: Instituto Pereira Passos / data.rio',
  portfolio: 'Um jogo de Marcelo Vergara',
  privacySettings: 'Privacidade',
  closePrivacySettings: 'Fechar preferências de privacidade',
  guessesArea: 'Área de palpites',
  guessHistory: 'Histórico de palpites',
  gameMode: 'Modo de jogo',
  daily: 'Diário',
  practice: 'Prática',
  poolSelection: 'Seleção de conjunto',
  known: 'Conhecidos',
  all: 'Todos',
  hint: 'Dica',
  newGame: 'Novo jogo',
  loadingDaily: 'Carregando desafio diário…',
  retry: 'Tentar novamente',
  playPractice: 'Jogar na prática',
  share: 'Compartilhar',
  playAgain: 'Jogar de novo',
  todayRanking: 'Classificação de hoje',
  nickname: 'Seu apelido',
  optional: 'Opcional',
  saving: 'Salvando…',
  save: 'Salvar',
  ranking: 'Classificação',
  refresh: 'Atualizar',
  loadingRanking: 'Carregando classificação…',
  emptyRanking: 'A classificação ainda está vazia.',
  anonymous: 'anônimo',
  points: 'pts',
  wait: 'Aguarde…',
  dailyUnavailableInput: 'Desafio indisponível',
  typeBairro: 'Digite um bairro',
  correctInput: 'Você acertou!',
  searchBairro: 'Buscar bairro',
  noResults: 'Nenhum bairro encontrado',
  cancel: 'Cancelar',
  revealedHints: 'Dicas reveladas',
  hintExplanation: 'Cada dica vale um palpite no ranking diário',
  dismissHintExplanation: 'Dispensar explicação sobre dicas',
  hintTiers: {
    region: 'Região',
    character: 'Característica',
    giveaway: 'Quase lá',
  },
  aboutBairro: 'Sobre o bairro',
  bairroLocation: (name: string, rp: string) => `${name} fica em ${rp}`,
  knownBairro: ' e é um bairro conhecido.',
  stats: 'Suas estatísticas',
  games: 'Jogos',
  streak: 'Sequência',
  best: 'Melhor',
  distribution: 'Distribuição',
  mapLabel: 'Mapa dos bairros do Rio de Janeiro',
  adjacent: 'encosta',
  guessCount: (count: number) =>
    `${count} ${count === 1 ? 'palpite' : 'palpites'}`,
  hintCount: (count: number) => `${count} ${count === 1 ? 'dica' : 'dicas'}`,
  participantCount: (count: number) =>
    `${count} ${count === 1 ? 'participante' : 'participantes'}`,
  errors: {
    PUZZLE_NOT_FOUND: 'O desafio de hoje ainda não está disponível.',
    PUZZLE_NUMBER_MISMATCH: 'O desafio de hoje está com dados inconsistentes.',
    INVALID_PUZZLE_DATE: 'A data do desafio é inválida.',
    INVALID_DEVICE_ID: 'Não foi possível identificar este dispositivo.',
    INVALID_ACTION: 'A ação solicitada é inválida.',
    UNKNOWN_CODE: 'Esse bairro não faz parte do jogo.',
    EXCLUDED_CODE: 'Esse bairro não está disponível.',
    INVALID_HINT_TIER: 'Essa dica não está disponível.',
    RATE_LIMITED: 'Limite de tentativas atingido hoje.',
    DUPLICATE_GUESS: 'Esse bairro já foi tentado.',
    GAME_COMPLETE: 'A partida já foi concluída.',
    INCOMPLETE_GAME: 'A partida ainda não foi concluída.',
    IMPOSSIBLE_SEQUENCE: 'A sequência registrada é inválida.',
    NOT_TODAY: 'Só é possível enviar o resultado de hoje.',
    ALREADY_SUBMITTED: 'Resultado já enviado.',
    MATRIX_MISMATCH: 'O resultado não pôde ser validado.',
    DUPLICATE_CODE: 'Há um palpite repetido no resultado.',
    ANSWER_BEFORE_FINAL: 'A sequência de palpites é inválida.',
    FINAL_ANSWER_INCORRECT: 'O último palpite não é a resposta.',
    INVALID_HINTS: 'A quantidade de dicas é inválida.',
    INVALID_ELAPSED_SECONDS: 'O tempo da partida é inválido.',
    INVALID_SCORE: 'A pontuação não pôde ser validada.',
    INVALID_NICKNAME: 'Esse apelido não pode ser usado.',
    NO_RESULT: 'Envie o resultado antes de salvar o apelido.',
    METHOD_NOT_ALLOWED: 'O servidor recusou a solicitação.',
    INTERNAL_ERROR: 'O servidor encontrou um erro.',
    CLIENT_CONFIG: 'O modo diário não está configurado neste ambiente.',
    CLIENT_NETWORK: 'Não foi possível falar com o servidor.',
    CLIENT_RESPONSE: 'O servidor não respondeu como esperado.',
    DAILY_UNAVAILABLE: 'Modo diário indisponível.',
    LEADERBOARD_LOAD: 'Não foi possível carregar a classificação.',
    RESULT_SEND: 'Falha ao enviar resultado.',
    NICKNAME_SAVE: 'Não foi possível salvar o apelido.',
    ANSWER_VERIFY: 'A resposta recebida não passou pela verificação.',
    ANSWER_INCOMPLETE: 'Resposta incompleta do servidor.',
    GUESS_FAILED: 'Palpite não registrado.',
    HINT_FAILED: 'Dica não revelada.',
  },
  alreadyGuessed: 'Você já tentou esse bairro.',
  resultSent: 'Resultado enviado.',
  resultAlreadySent: 'Resultado já enviado.',
  retryNextVisit: 'Tentaremos novamente na próxima visita.',
  nicknameSaved: 'Apelido salvo.',
  shared: 'Compartilhado!',
  copied: 'Resultado copiado!',
  shareFailed: 'Não foi possível compartilhar.',
}

const en: typeof ptBR = {
  ...ptBR,
  description: 'A game about the neighborhoods of Rio de Janeiro.',
  languageLabel: 'Language',
  languageButton: 'PT',
  analyticsConsentLabel: 'Privacy preferences',
  analyticsConsentMessage:
    'We can use anonymous usage data to improve the game. You can accept or reject.',
  dailyIdentityMessage:
    'In Daily mode, we store an anonymous identifier on this device to keep your result and limit leaderboard entries.',
  rejectAnalytics: 'Reject',
  acceptAnalytics: 'Accept',
  attribution: 'Data: Instituto Pereira Passos / data.rio',
  portfolio: 'A game by Marcelo Vergara',
  privacySettings: 'Privacy',
  closePrivacySettings: 'Close privacy preferences',
  guessesArea: 'Guess area',
  guessHistory: 'Guess history',
  gameMode: 'Game mode',
  daily: 'Daily',
  practice: 'Practice',
  poolSelection: 'Neighborhood set',
  known: 'Well-known',
  all: 'All',
  hint: 'Hint',
  newGame: 'New game',
  loadingDaily: 'Loading daily challenge…',
  retry: 'Try again',
  playPractice: 'Play practice mode',
  share: 'Share',
  playAgain: 'Play again',
  todayRanking: "Today's leaderboard",
  nickname: 'Your nickname',
  optional: 'Optional',
  saving: 'Saving…',
  save: 'Save',
  ranking: 'Leaderboard',
  refresh: 'Refresh',
  loadingRanking: 'Loading leaderboard…',
  emptyRanking: 'The leaderboard is empty.',
  anonymous: 'anonymous',
  points: 'pts',
  wait: 'Please wait…',
  dailyUnavailableInput: 'Challenge unavailable',
  typeBairro: 'Type a neighborhood',
  correctInput: 'You got it!',
  searchBairro: 'Search for a neighborhood',
  noResults: 'No neighborhoods found',
  cancel: 'Cancel',
  revealedHints: 'Revealed hints',
  hintExplanation: 'Each hint counts as one guess in the daily ranking',
  dismissHintExplanation: 'Dismiss hint explanation',
  hintTiers: {
    region: 'Region',
    character: 'Character',
    giveaway: 'Almost there',
  },
  aboutBairro: 'About the neighborhood',
  bairroLocation: (name, rp) => `${name} is in ${rp}`,
  knownBairro: ' and is a well-known neighborhood.',
  stats: 'Your statistics',
  games: 'Games',
  streak: 'Streak',
  best: 'Best',
  distribution: 'Distribution',
  mapLabel: 'Map of Rio de Janeiro neighborhoods',
  adjacent: 'adjacent',
  guessCount: (count) => `${count} ${count === 1 ? 'guess' : 'guesses'}`,
  hintCount: (count) => `${count} ${count === 1 ? 'hint' : 'hints'}`,
  participantCount: (count) => `${count} ${count === 1 ? 'player' : 'players'}`,
  errors: {
    PUZZLE_NOT_FOUND: "Today's challenge is not available yet.",
    PUZZLE_NUMBER_MISMATCH: "Today's challenge has inconsistent data.",
    INVALID_PUZZLE_DATE: 'The challenge date is invalid.',
    INVALID_DEVICE_ID: 'This device could not be identified.',
    INVALID_ACTION: 'The requested action is invalid.',
    UNKNOWN_CODE: 'This neighborhood is not part of the game.',
    EXCLUDED_CODE: 'This neighborhood is not available.',
    INVALID_HINT_TIER: 'This hint is not available.',
    RATE_LIMITED: 'Daily attempt limit reached.',
    DUPLICATE_GUESS: 'This neighborhood was already guessed.',
    GAME_COMPLETE: 'This game is already complete.',
    INCOMPLETE_GAME: 'This game is not complete yet.',
    IMPOSSIBLE_SEQUENCE: 'The recorded sequence is invalid.',
    NOT_TODAY: "Only today's result can be submitted.",
    ALREADY_SUBMITTED: 'Result already submitted.',
    MATRIX_MISMATCH: 'The result could not be validated.',
    DUPLICATE_CODE: 'The result contains a repeated guess.',
    ANSWER_BEFORE_FINAL: 'The guess sequence is invalid.',
    FINAL_ANSWER_INCORRECT: 'The last guess is not the answer.',
    INVALID_HINTS: 'The number of hints is invalid.',
    INVALID_ELAPSED_SECONDS: 'The game duration is invalid.',
    INVALID_SCORE: 'The score could not be validated.',
    INVALID_NICKNAME: 'That nickname cannot be used.',
    NO_RESULT: 'Submit the result before saving a nickname.',
    METHOD_NOT_ALLOWED: 'The server rejected the request.',
    INTERNAL_ERROR: 'The server encountered an error.',
    CLIENT_CONFIG: 'Daily mode is not configured in this environment.',
    CLIENT_NETWORK: 'The server could not be reached.',
    CLIENT_RESPONSE: 'The server returned an unexpected response.',
    DAILY_UNAVAILABLE: 'Daily mode is unavailable.',
    LEADERBOARD_LOAD: 'The leaderboard could not be loaded.',
    RESULT_SEND: 'The result could not be submitted.',
    NICKNAME_SAVE: 'The nickname could not be saved.',
    ANSWER_VERIFY: 'The received answer failed verification.',
    ANSWER_INCOMPLETE: 'The server returned an incomplete answer.',
    GUESS_FAILED: 'The guess was not recorded.',
    HINT_FAILED: 'The hint was not revealed.',
  },
  alreadyGuessed: 'You already tried this neighborhood.',
  resultSent: 'Result submitted.',
  resultAlreadySent: 'Result already submitted.',
  retryNextVisit: 'We will try again on your next visit.',
  nicknameSaved: 'Nickname saved.',
  shared: 'Shared!',
  copied: 'Result copied!',
  shareFailed: 'The result could not be shared.',
}

export const strings = { 'pt-BR': ptBR, en }
export type Strings = typeof ptBR

interface LanguageContextValue {
  englishEnabled: boolean
  language: Language
  setLanguage: (language: Language) => void
  text: Strings
}

const LanguageContext = createContext<LanguageContextValue>({
  englishEnabled: false,
  language: 'pt-BR',
  setLanguage: () => undefined,
  text: ptBR,
})

export function englishFeatureEnabled(
  value = import.meta.env.VITE_ENABLE_EN,
): boolean {
  return value === 'true'
}

function initialLanguage(englishEnabled: boolean): Language {
  if (!englishEnabled) return 'pt-BR'
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pt-BR'
  } catch {
    return 'pt-BR'
  }
}

export function LanguageProvider({
  children,
  enableEnglish = englishFeatureEnabled(),
}: {
  children?: ReactNode
  enableEnglish?: boolean
}) {
  const [storedLanguage, setStoredLanguage] = useState<Language>(() =>
    initialLanguage(enableEnglish),
  )
  const language = enableEnglish ? storedLanguage : 'pt-BR'
  const setLanguage = (next: Language) =>
    setStoredLanguage(enableEnglish ? next : 'pt-BR')
  const text = strings[language]

  useEffect(() => {
    document.documentElement.lang = language
    document.title = text.title
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', `${text.title} ${text.description}`)
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // The language still changes when storage is unavailable.
    }
  }, [language, text])

  return (
    <LanguageContext.Provider
      value={{ englishEnabled: enableEnglish, language, setLanguage, text }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageToggle({ className }: { className?: string }) {
  const { englishEnabled, language, setLanguage, text } = useLanguage()
  if (!englishEnabled) return null
  return (
    <button
      aria-label={text.languageLabel}
      className={className}
      onClick={() => setLanguage(language === 'pt-BR' ? 'en' : 'pt-BR')}
      type="button"
    >
      {text.languageButton}
    </button>
  )
}

export function localizedError(
  error: unknown,
  text: Strings,
  fallback: string,
) {
  if (!(error instanceof Error)) return fallback
  return (
    text.errors[error.name as keyof Strings['errors']] ??
    (error.name === 'Error' ? error.message : fallback)
  )
}
