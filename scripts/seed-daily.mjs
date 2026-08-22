import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'

const epoch = '2026-08-25'
const timeZone = 'America/Sao_Paulo'
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const today = dateInSaoPaulo()
const from = argument('from') ?? today
const days = Number(argument('days') ?? 60)
if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isInteger(days) || days < 1) {
  throw new Error('Usage: npm run seed:daily -- --from=YYYY-MM-DD --days=N')
}

const poolFile = JSON.parse(readFileSync('data/pool.json', 'utf8'))
const exclusions = JSON.parse(readFileSync('data/exclude.json', 'utf8'))
const pool = poolFile.codes.filter((cod) => !exclusions.daily.includes(cod))
const dates = Array.from({ length: days }, (_, index) => addDays(from, index))
const existing = await getExisting(dates[0], dates.at(-1))

for (const puzzleDate of dates) {
  if (existing.has(puzzleDate)) {
    console.log(`Skipped ${puzzleDate}: answer already exists`)
    continue
  }
  const puzzleNumber = numberForDate(puzzleDate)
  if (puzzleNumber < 1) throw new Error(`${puzzleDate} predates puzzle #1`)
  const cod = pool[randomInt(pool.length)]
  const response = await request('daily_answers', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      puzzle_date: puzzleDate,
      puzzle_number: puzzleNumber,
      cod,
    }),
  })
  if (!response.ok)
    throw new Error(`Insert failed for ${puzzleDate}: ${await response.text()}`)
  console.log(`Inserted ${puzzleDate} (#${puzzleNumber})`)
}

function argument(name) {
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(`--${name}=`))
    ?.split('=')[1]
}

function dateInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(Date.now())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function dateValue(value) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function addDays(value, count) {
  return new Date(dateValue(value) + count * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function numberForDate(value) {
  return Math.floor((dateValue(value) - dateValue(epoch)) / 86_400_000) + 1
}

async function request(path, init) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
}

async function getExisting(first, last) {
  const response = await request(
    `daily_answers?puzzle_date=gte.${first}&puzzle_date=lte.${last}&select=puzzle_date`,
  )
  if (!response.ok)
    throw new Error(`Existing-answer query failed: ${await response.text()}`)
  return new Set((await response.json()).map((row) => row.puzzle_date))
}
