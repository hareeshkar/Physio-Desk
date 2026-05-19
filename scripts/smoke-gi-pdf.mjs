/**
 * Diagnostic smoke test: GI PDF → extract → 2 MCQ via MiniMax (no truncation).
 * Run: npx vite-node scripts/smoke-gi-pdf.mjs
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareSourceDocument, requirePdfSource } from '../server/_document.ts'
import { generateMiniMaxQuiz, verifyMiniMaxQuestions } from '../server/_minimaxStudy.ts'
import { planPageChunks, summarizeExtraction } from '../src/lib/sourceCoverage.ts'

const PDF_NAME = 'Gastrointestinal Pathology ..pdf'
const REQUESTED_MCQ = 2
const REQUESTED_SHORT = 0
const CHOICE_COUNT = 4

await loadLocalEnv()
if (!process.env.MINIMAX_API_KEY) {
  throw new Error('MINIMAX_API_KEY missing from .env')
}

const pdfBytes = await readFile(resolve(process.cwd(), PDF_NAME))
const pdfSource = requirePdfSource({
  fileName: PDF_NAME,
  mimeType: 'application/pdf',
  base64: pdfBytes.toString('base64'),
})

console.log('\n=== 1. PDF parse (server) ===')
const t0 = performance.now()
const source = await prepareSourceDocument(pdfSource, { enableVlm: false })
const parseMs = Math.round(performance.now() - t0)
const stats = summarizeExtraction(source.pages)

console.log(`  pages: ${stats.pageCount} | strong: ${stats.strongPageCount} | weak: ${stats.weakPageCount}`)
console.log(`  fullText chars: ${source.fullText.length} (~${Math.round(source.fullText.length / stats.pageCount)} per page)`)
console.log(`  parse time: ${parseMs}ms`)
if (source.warnings.length) console.log(`  warnings: ${source.warnings.join(' ')}`)

const weakSamples = source.pages.filter((p) => p.extractionQuality === 'weak').slice(0, 3)
if (weakSamples.length) {
  console.log('  sample weak pages:')
  for (const p of weakSamples) {
    console.log(`    page ${p.pageNumber}: ${p.text.length} chars — "${p.text.slice(0, 80).replace(/\n/g, ' ')}${p.text.length > 80 ? '…' : ''}"`)
  }
}

const chunks = planPageChunks(source.pages)
console.log(`  generation chunks: ${chunks.length} (${chunks.map((c) => `p${c.pageNumbers[0]}-${c.pageNumbers[c.pageNumbers.length - 1]}`).join(', ')})`)

console.log('\n=== 2. MiniMax generate (2 MCQ, full doc in one call) ===')
const t1 = performance.now()
let generated
try {
  generated = await generateMiniMaxQuiz({
    source,
    requestedMcq: REQUESTED_MCQ,
    requestedShort: REQUESTED_SHORT,
    choiceCount: CHOICE_COUNT,
    previousQuestions: [],
  })
} catch (error) {
  console.log(`  FAILED: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
const genMs = Math.round(performance.now() - t1)

const mcqs = generated.questions.filter((q) => q.type === 'mcq')
const essays = generated.questions.filter((q) => q.type === 'short_essay')
console.log(`  time: ${genMs}ms`)
console.log(`  returned: ${generated.questions.length} questions (${mcqs.length} mcq, ${essays.length} essay)`)
console.log(`  asked for: ${REQUESTED_MCQ} mcq (+${2} candidate buffer in prompt)`)
if (generated.warnings?.length) console.log(`  model warnings: ${generated.warnings.join(' ')}`)

for (const [i, q] of mcqs.slice(0, 3).entries()) {
  console.log(`\n  MCQ ${i + 1}: [${q.topic}]`)
  console.log(`    Q: ${q.prompt.slice(0, 140)}${q.prompt.length > 140 ? '…' : ''}`)
  console.log(`    evidence: "${q.evidenceQuote.slice(0, 120)}${q.evidenceQuote.length > 120 ? '…' : ''}"`)
  console.log(`    page: ${q.pageNumber ?? 'none'} | confidence: ${q.groundingConfidence}`)
}

console.log('\n=== 3. MiniMax verify (full source, all returned questions) ===')
const t2 = performance.now()
let verification
try {
  verification = await verifyMiniMaxQuestions({ source, questions: generated.questions })
} catch (error) {
  console.log(`  FAILED: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
const verifyMs = Math.round(performance.now() - t2)

const accepted = verification.results.filter((r) => r.verdict === 'accepted')
const rejected = verification.results.filter((r) => r.verdict !== 'accepted')
console.log(`  time: ${verifyMs}ms`)
console.log(`  accepted: ${accepted.length}/${verification.results.length}`)
for (const r of rejected.slice(0, 3)) {
  console.log(`  rejected: ${r.reason ?? r.verdict}`)
}

console.log('\n=== 4. Diagnosis ===')
const totalMs = parseMs + genMs + verifyMs
console.log(`  total wall: ${totalMs}ms (parse ${parseMs} + gen ${genMs} + verify ${verifyMs})`)
console.log(`  Netlify limit ~26s per function → ${totalMs > 26_000 ? 'WOULD TIMEOUT on single combined call' : 'fits one function if only generate OR only verify'}`)
if (genMs > 26_000) console.log('  → generate alone exceeds Netlify')
if (verifyMs > 26_000) console.log('  → verify alone exceeds Netlify')
if (stats.weakPageCount > stats.pageCount * 0.5) {
  console.log('  → PRIMARY CONTENT ISSUE: most pages are image-heavy; text extraction is thin — quiz may be shallow or ungrounded on diagram facts')
}
if (mcqs.length < REQUESTED_MCQ) {
  console.log(`  → MODEL ISSUE: returned ${mcqs.length} MCQs, wanted ${REQUESTED_MCQ}`)
}

console.log('\nSmoke done.\n')

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
