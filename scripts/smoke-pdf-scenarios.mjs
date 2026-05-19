/**
 * End-to-end MiniMax timing for real PDFs (standard M2.7 only).
 *
 * Usage:
 *   npx vite-node scripts/smoke-pdf-scenarios.mjs --pdf "7. Reproductive System.pdf" --mcq 20
 *   npx vite-node scripts/smoke-pdf-scenarios.mjs --pdf "Gastrointestinal Pathology ..pdf" --mcq 2
 *   npx vite-node scripts/smoke-pdf-scenarios.mjs --suite
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareSourceDocument, preparedSourceToDocument, requirePdfSource } from '../server/_document.ts'
import { generateMiniMaxQuiz, verifyMiniMaxQuestions } from '../server/_minimaxStudy.ts'
import { planPageChunks, summarizeExtraction } from '../src/lib/sourceCoverage.ts'
import { splitCountsAcrossChunks } from '../src/lib/sourceCoverage.ts'
import { selectQuestionsForVerification } from '../src/lib/questionSelection.ts'

const args = parseArgs(process.argv.slice(2))
const suite = args.suite
  ? [
      { pdf: 'Gastrointestinal Pathology ..pdf', mcq: 2, short: 0 },
      { pdf: '7. Reproductive System.pdf', mcq: 20, short: 0 },
      { pdf: '7. Reproductive System.pdf', mcq: 15, short: 0 },
      { pdf: '7. Reproductive System.pdf', mcq: 0, short: 5 },
    ]
  : [{ pdf: args.pdf, mcq: args.mcq, short: args.short }]

await loadLocalEnv()
if (!process.env.MINIMAX_API_KEY) {
  throw new Error('MINIMAX_API_KEY missing from .env')
}

console.log('\nModel: MiniMax-M2.7 (standard only)\n')

for (const scenario of suite) {
  await runScenario(scenario)
}

async function runScenario({ pdf, mcq, short }) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`SCENARIO: ${pdf} | ${mcq} MCQ | ${short} short essay`)
  console.log('='.repeat(72))

  const bytes = await readFile(resolve(process.cwd(), pdf))
  const tParse = performance.now()
  const source = await prepareSourceDocument(
    requirePdfSource({ fileName: pdf, mimeType: 'application/pdf', base64: bytes.toString('base64') }),
    { enableVlm: false },
  )
  const parseMs = Math.round(performance.now() - tParse)
  const stats = summarizeExtraction(source.pages)
  const chunks = planPageChunks(source.pages)

  console.log(`parse: ${parseMs}ms | pages: ${stats.pageCount} | chars: ${source.fullText.length} | chunks: ${chunks.length}`)

  const generatedQuestions = []
  const tGen = performance.now()

  if (chunks.length <= 1) {
    const generated = await generateMiniMaxQuiz({
      source,
      requestedMcq: mcq,
      requestedShort: short,
      choiceCount: 4,
    })
    generatedQuestions.push(...generated.questions)
  } else {
    const results = await Promise.all(
      chunks.map(async (chunk, index) => {
        const counts = splitCountsAcrossChunks({ mcq, shortEssay: short }, index, chunks.length)
        if (counts.mcq === 0 && counts.shortEssay === 0) return { questions: [] }
        const scoped = preparedSourceToDocument(
          {
            fileName: source.fileName,
            fullText: source.fullText,
            pages: source.pages,
          },
          { pageNumbers: chunk.pageNumbers },
        )
        const generated = await generateMiniMaxQuiz({
          source: scoped,
          requestedMcq: counts.mcq,
          requestedShort: counts.shortEssay,
          choiceCount: 4,
        })
        return generated
      }),
    )
    for (const result of results) generatedQuestions.push(...result.questions)
  }

  const genMs = Math.round(performance.now() - tGen)
  const mcqCount = generatedQuestions.filter((q) => q.type === 'mcq').length
  const shortCount = generatedQuestions.filter((q) => q.type === 'short_essay').length
  console.log(`generate: ${genMs}ms | returned: ${generatedQuestions.length} (${mcqCount} mcq, ${shortCount} short)`)

  const toVerify = selectQuestionsForVerification(generatedQuestions, { mcq, shortEssay: short })
  console.log(`verify input capped: ${toVerify.length} (from ${generatedQuestions.length})`)

  const tVerify = performance.now()
  const verified = await verifyMiniMaxQuestions({ source, questions: toVerify })
  const verifyMs = Math.round(performance.now() - tVerify)
  const accepted = verified.results.filter((r) => r.verdict === 'accepted').length
  console.log(`verify: ${verifyMs}ms | accepted: ${accepted}/${verified.results.length}`)
  console.log(`TOTAL: ${parseMs + genMs + verifyMs}ms`)
}

function parseArgs(argv) {
  const out = { pdf: 'Gastrointestinal Pathology ..pdf', mcq: 2, short: 0, suite: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--suite') out.suite = true
    if (arg === '--pdf') out.pdf = argv[++i]
    if (arg === '--mcq') out.mcq = Number(argv[++i])
    if (arg === '--short') out.short = Number(argv[++i])
  }
  return out
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
    // optional
  }
}
