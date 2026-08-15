import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseHintsResponse, validateHints } from './hints-response.mjs'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY before generating hints')

const bairros = JSON.parse(
  readFileSync('data/bairros.geojson', 'utf8'),
).features
const output = existsSync('data/hints.json')
  ? JSON.parse(readFileSync('data/hints.json', 'utf8'))
  : {}
const retryableStatuses = new Set([429, 500, 529])
const hintsSchema = {
  type: 'object',
  properties: {
    region: { type: 'string', description: 'Dica regional em PT-BR.' },
    character: {
      type: 'string',
      description: 'Dica de personalidade em PT-BR.',
    },
    giveaway: {
      type: 'string',
      description: 'Dica quase reveladora em PT-BR.',
    },
  },
  required: ['region', 'character', 'giveaway'],
  additionalProperties: false,
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function requestHints(nome, prompt) {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }],
          output_config: {
            format: { type: 'json_schema', schema: hintsSchema },
          },
        }),
      })

      if (response.ok) {
        const body = await response.json()
        if (body.stop_reason === 'refusal') {
          throw new Error(`${nome}: Anthropic refused to generate hints`, {
            cause: 'non-retryable',
          })
        }
        if (body.stop_reason === 'max_tokens') {
          lastError = new Error('response was truncated at max_tokens=1024')
        } else {
          try {
            return parseHintsResponse(body.content, nome)
          } catch (error) {
            lastError = error
          }
        }
      } else {
        const detail = await response.text()
        if (!retryableStatuses.has(response.status)) {
          throw new Error(
            `${nome}: Anthropic returned non-retryable HTTP ${response.status}: ${detail}`,
            { cause: 'non-retryable' },
          )
        }
        lastError = new Error(`HTTP ${response.status}: ${detail}`)
      }
    } catch (error) {
      if (error.cause === 'non-retryable') throw error
      lastError = error
    }

    if (attempt < 5) {
      const delay = Math.min(4000, 1000 * 2 ** (attempt - 1))
      console.warn(
        `${nome}: attempt ${attempt}/5 failed (${lastError?.message ?? 'unknown error'}); retrying in ${delay / 1000}s`,
      )
      await wait(delay)
    }
  }

  throw new Error(
    `${nome}: hint request failed after 5 attempts: ${lastError?.message ?? 'unknown error'}`,
  )
}

for (const [index, feature] of bairros.entries()) {
  const { codbairro, nome, rp, regiao_adm } = feature.properties
  if (output[codbairro]) {
    validateHints(output[codbairro], nome)
    console.log(`[${index + 1}/${bairros.length}] ${nome} (já existe)`)
    continue
  }
  const prompt = `Crie três dicas em português do Brasil para o bairro ${JSON.stringify(nome)}, do município do Rio de Janeiro.
Contexto administrativo: região de planejamento ${JSON.stringify(rp)}; região administrativa ${JSON.stringify(regiao_adm)}.
As dicas devem ser factualmente corretas, concisas e ter no máximo 140 caracteres cada.
Nível 1: localização/região ampla. Nível 2: personalidade, paisagem, história ou característica. Nível 3: quase entrega a resposta.
Nenhuma dica pode conter o nome do bairro nem qualquer palavra que faça parte desse nome, mesmo sem acentos ou com outra caixa.
Responda somente JSON estrito, sem markdown, exatamente neste formato: {"region":"...","character":"...","giveaway":"..."}`

  output[codbairro] = await requestHints(nome, prompt)
  writeFileSync('data/hints.json', `${JSON.stringify(output, null, 2)}\n`)
  console.log(`[${index + 1}/${bairros.length}] ${nome}`)
}
