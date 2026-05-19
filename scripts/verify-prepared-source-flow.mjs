import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  prepareSourceDocument,
  preparedSourceToDocument,
  requirePdfSource,
  requirePreparedSource,
  resolveStudySource,
} from '../server/_document.ts'
import {
  generateMiniMaxQuiz,
  verifyMiniMaxQuestions,
} from '../server/_minimaxStudy.ts'
import { planPageChunks } from '../src/lib/sourceCoverage.ts'

const PDF_NAME = 'Gastrointestinal Pathology ..pdf'
const REQUIRED_MCQ = 2
const REQUIRED_SHORT = 1
const CHOICE_COUNT = 4

await loadLocalEnv()

if (!process.env.MINIMAX_API_KEY) {
  throw new Error('MINIMAX_API_KEY is not configured in .env or the environment.')
}

const pdfPath = resolve(process.cwd(), PDF_NAME)
const pdfBytes = await readFile(pdfPath)
const pdfBase64 = pdfBytes.toString('base64')

console.log('--- Local prepared-source flow (no truncation) ---')
console.log(`PDF: ${PDF_NAME} (${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB raw)`)
console.log(`Base64 upload size would be ~${(Buffer.byteLength(JSON.stringify({ pdfSource: { fileName: PDF_NAME, mimeType: 'application/pdf', base64: pdfBase64 } })) / 1024 / 1024).toFixed(2)} MB JSON`)

const parseStart = performance.now()
const pdfSource = requirePdfSource({
  fileName: PDF_NAME,
  mimeType: 'application/pdf',
  base64: pdfBase64,
})
const parsed = await prepareSourceDocument(pdfSource, { enableVlm: false })
const parseMs = Math.round(performance.now() - parseStart)

const clientPrepared = requirePreparedSource({
  fileName: PDF_NAME,
  fullText: parsed.fullText,
  pages: parsed.pages,
  stats: {
    pageCount: parsed.pages.length,
    weakPageCount: parsed.pages.filter((page) => page.extractionQuality === 'weak').length,
    strongPageCount: parsed.pages.filter((page) => page.extractionQuality === 'strong').length,
    visualPageCount: parsed.pages.filter((page) => page.extractionQuality === 'visual').length,
  },
  warnings: parsed.warnings,
})
const textPayloadBytes = Buffer.byteLength(JSON.stringify({ preparedSource: clientPrepared }))
const chunks = planPageChunks(clientPrepared.pages ?? [])
console.log(`Server PDF parse: ${parseMs}ms, ${parsed.pages.length} pages, ${parsed.fullText.length} chars extracted`)
console.log(`Text-only API payload: ~${(textPayloadBytes / 1024).toFixed(0)} KB (vs multi-MB with base64)`)
console.log(`Chunk plan: ${chunks.length} call(s) for generation (no silent truncation)`)

if (parsed.warnings.length) {
  console.log(`Parse warnings: ${parsed.warnings.join(' ')}`)
}

const resolveStart = performance.now()
const fullSource = await resolveStudySource({ preparedSource: clientPrepared })
console.log(`resolveStudySource(full): ${Math.round(performance.now() - resolveStart)}ms, model text ${fullSource.fullText.length} chars`)
assert(fullSource.fullText.length === clientPrepared.fullText.length, 'full source must not be truncated')

const allQuestions = []
let generateMs = 0
for (let index = 0; index < chunks.length; index += 1) {
  const chunk = chunks[index]
  const chunkSource = await resolveStudySource({
    preparedSource: clientPrepared,
    pageNumbers: chunk.pageNumbers,
  })
  const generateStart = performance.now()
  const generated = await generateMiniMaxQuiz({
    source: chunkSource,
    requestedMcq: REQUIRED_MCQ,
    requestedShort: REQUIRED_SHORT,
    choiceCount: CHOICE_COUNT,
    previousQuestions: allQuestions.map((question) => ({ prompt: question.prompt, topic: question.topic })),
  })
  generateMs += Math.round(performance.now() - generateStart)
  assertQuizStructure(generated)
  allQuestions.push(...generated.questions)
  console.log(`chunk ${index + 1}/${chunks.length} (pages ${chunk.pageNumbers.join(',')}): ${generated.questions.length} questions`)
}

console.log(`generateMiniMaxQuiz (chunked): ${generateMs}ms -> ${allQuestions.length} questions total`)

const verifyStart = performance.now()
const verification = await verifyMiniMaxQuestions({
  source: preparedSourceToDocument(clientPrepared),
  questions: allQuestions,
})
const verifyMs = Math.round(performance.now() - verifyStart)

const accepted = verification.results.filter((result) => result.verdict === 'accepted').length
console.log(`verifyMiniMaxQuestions (full source): ${verifyMs}ms -> ${accepted}/${allQuestions.length} accepted`)
if (verification.warnings.length) {
  console.log(`Verify warnings: ${verification.warnings.join(' ')}`)
}

const sample = allQuestions[0]
console.log('\nSample question:')
console.log(`  topic: ${sample.topic}`)
console.log(`  prompt: ${sample.prompt.slice(0, 120)}...`)
console.log(`  evidence: ${sample.evidenceQuote.slice(0, 100)}...`)

console.log('\nPrepared-source flow passed. Full text preserved; generation chunked for timeouts.')
console.log(`Total wall time (parse + generate + verify): ${parseMs + generateMs + verifyMs}ms`)

function assertQuizStructure(response) {
  assert(Array.isArray(response.questions), 'questions must be an array')
  assert(response.questions.filter((question) => question.type === 'mcq').length >= REQUIRED_MCQ, `expected at least ${REQUIRED_MCQ} MCQs`)
  assert(response.questions.filter((question) => question.type === 'short_essay').length >= REQUIRED_SHORT, `expected at least ${REQUIRED_SHORT} short essays`)

  for (const question of response.questions) {
    assertNonEmptyString(question.prompt, 'prompt')
    assertNonEmptyString(question.expectedAnswer, 'expectedAnswer')
    assertNonEmptyString(question.evidenceQuote, 'evidenceQuote')
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertNonEmptyString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string`)
}

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
    // .env is optional when env vars are already exported.
  }
}
