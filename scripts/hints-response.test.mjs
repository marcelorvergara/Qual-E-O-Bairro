import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHintsResponse } from './hints-response.mjs'

const expected = {
  region: 'Fica na Zona Norte.',
  character: 'Tem forte vida comunitária.',
  giveaway: 'Está cercada pela Baía de Guanabara.',
}

test('extracts JSON after explanatory prose and inside a Markdown fence', () => {
  const response = `I need to create three clues without using forbidden words.
\`\`\`json
${JSON.stringify(expected)}
\`\`\``

  assert.deepEqual(parseHintsResponse(response, 'Freguesia (Ilha)'), expected)
})

test('joins Anthropic text blocks before extracting JSON', () => {
  const content = [
    { type: 'text', text: 'Vou responder em JSON.' },
    { type: 'text', text: JSON.stringify(expected) },
  ]

  assert.deepEqual(parseHintsResponse(content, 'Freguesia (Ilha)'), expected)
})
