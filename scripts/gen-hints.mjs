import { readFileSync, writeFileSync } from 'node:fs'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY before generating hints')

const bairros = JSON.parse(readFileSync('data/bairros.geojson', 'utf8')).features
const output = {}

for (const [index, feature] of bairros.entries()) {
  const { codbairro, nome, rp, regiao_adm } = feature.properties
  const prompt = `Crie três dicas em português do Brasil para o bairro ${JSON.stringify(nome)}, do município do Rio de Janeiro.
Contexto administrativo: região de planejamento ${JSON.stringify(rp)}; região administrativa ${JSON.stringify(regiao_adm)}.
As dicas devem ser factualmente corretas, concisas e ter no máximo 140 caracteres cada.
Nível 1: localização/região ampla. Nível 2: personalidade, paisagem, história ou característica. Nível 3: quase entrega a resposta.
Nenhuma dica pode conter o nome do bairro nem qualquer palavra que faça parte desse nome, mesmo sem acentos ou com outra caixa.
Responda somente JSON estrito, sem markdown, exatamente neste formato: {"region":"...","character":"...","giveaway":"..."}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`${nome}: Anthropic returned ${response.status} ${await response.text()}`)
  }

  const body = await response.json()
  const text = body.content?.find((block) => block.type === 'text')?.text
  if (!text) throw new Error(`${nome}: response did not contain text`)

  output[codbairro] = JSON.parse(text)
  writeFileSync('data/hints.json', `${JSON.stringify(output, null, 2)}\n`)
  console.log(`[${index + 1}/${bairros.length}] ${nome}`)
}
