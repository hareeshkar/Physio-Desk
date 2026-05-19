import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareSourceDocument, requirePdfSource } from '../server/_document.ts'

const PDF_NAME = 'Gastrointestinal Pathology ..pdf'
const PORT = process.env.DEV_PORT ?? '5173'
const BASE = `http://localhost:${PORT}/api`

await loadLocalEnv()

const pdfBase64 = (await readFile(resolve(process.cwd(), PDF_NAME))).toString('base64')
const parsed = await prepareSourceDocument(
  requirePdfSource({ fileName: PDF_NAME, mimeType: 'application/pdf', base64: pdfBase64 }),
  { enableVlm: false },
)

const body = {
  preparedSource: { fileName: PDF_NAME, fullText: parsed.fullText },
  mode: 'quick',
  counts: { mcq: 2, shortEssay: 1 },
  choiceCount: 4,
  previousQuestions: [],
}

console.log(`POST ${BASE}/generate-quiz (${Buffer.byteLength(JSON.stringify(body))} bytes)`)
const start = performance.now()

const response = await fetch(`${BASE}/generate-quiz`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const raw = await response.text()
const elapsed = Math.round(performance.now() - start)

console.log(`Status: ${response.status} in ${elapsed}ms`)
console.log(`Content-Type: ${response.headers.get('content-type')}`)

if (raw.includes('Inactivity Timeout')) {
  console.error('FAILED: gateway returned Inactivity Timeout HTML')
  process.exit(1)
}

if (!response.ok) {
  console.error(raw.slice(0, 500))
  process.exit(1)
}

const json = JSON.parse(raw)
console.log(`Questions: ${json.questions?.length ?? 0}`)
console.log(`Warnings: ${json.warnings?.length ? json.warnings.join(' | ') : 'none'}`)
console.log('Local HTTP generate-quiz passed.')

async function loadLocalEnv() {
  try {
    const envFile = await readFile(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // optional
  }
}
