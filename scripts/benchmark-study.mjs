/**
 * Millisecond-precision benchmark for study pipeline (standard MiniMax-M2.7).
 * Usage: npm run benchmark:study -- --pdf "7. Reproductive System.pdf" --mcq 20
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { prepareSourceDocument, preparedSourceToDocument, requirePdfSource } from '../server/_document.ts'
import { generateMiniMaxQuiz, verifyMiniMaxQuestions } from '../server/_minimaxStudy.ts'
import { planGenerateJobs } from '../src/lib/generateJobs.ts'
import { selectQuestionsForVerification } from '../src/lib/questionSelection.ts'
import { chunkArray, mapWithConcurrency, planVerifyBatches } from '../src/lib/parallel.ts'

const args = parseArgs(process.argv.slice(2))
const outPath = resolve(process.cwd(), 'docs/benchmark-latest.json')

await loadLocalEnv()
if (!process.env.MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY missing')

const runStarted = performance.now()
const marks = []

function mark(name, meta = {}) {
  const t = performance.now()
  marks.push({ name, atMs: t - runStarted, ...meta })
  return t
}

mark('runStart')

const bytes = await readFile(resolve(process.cwd(), args.pdf))
const parseStart = performance.now()
const source = await prepareSourceDocument(
  requirePdfSource({ fileName: args.pdf, mimeType: 'application/pdf', base64: bytes.toString('base64') }),
  { enableVlm: false },
)
const parseMs = performance.now() - parseStart
mark('parseDone', { parseMs: Number(parseMs.toFixed(1)) })

const jobs = planGenerateJobs(source.pages, { mcq: args.mcq, shortEssay: args.short })
const generatedQuestions = []
const genStart = performance.now()

await mapWithConcurrency(jobs, 2, async (job, index) => {
  if (job.counts.mcq === 0 && job.counts.shortEssay === 0) return
  const scoped = job.pageNumbers.length
    ? preparedSourceToDocument(
        { fileName: source.fileName, fullText: source.fullText, pages: source.pages },
        { pageNumbers: job.pageNumbers },
      )
    : source
  const chunkStart = performance.now()
  let networkMs = 0
  const generated = await generateMiniMaxQuiz({
    source: scoped,
    requestedMcq: job.counts.mcq,
    requestedShort: job.counts.shortEssay,
    choiceCount: 4,
    onNetworkMs: (ms) => {
      networkMs = ms
    },
  })
  mark(`generateJob${index + 1}`, {
    ms: Number((performance.now() - chunkStart).toFixed(1)),
    networkMs: Number(networkMs.toFixed(1)),
    mcq: job.counts.mcq,
    pages: job.pageNumbers.length,
  })
  generatedQuestions.push(...generated.questions)
})

const generateMs = performance.now() - genStart
mark('generateDone', { generateMs: Number(generateMs.toFixed(1)), count: generatedQuestions.length })

const toVerify = selectQuestionsForVerification(generatedQuestions, { mcq: args.mcq, shortEssay: args.short })
const batchSizes = planVerifyBatches(toVerify.length)
const batches = batchSizes.reduce((groups, size) => {
  const start = groups.flat().length
  groups.push(toVerify.slice(start, start + size))
  return groups
}, [])

const verifyStart = performance.now()
const verifyBatchMs = []
await mapWithConcurrency(batches, 2, async (batch, index) => {
  const batchStart = performance.now()
  let networkMs = 0
  await verifyMiniMaxQuestions({
    source,
    questions: batch,
    onNetworkMs: (ms) => {
      networkMs = ms
    },
  })
  const ms = performance.now() - batchStart
  verifyBatchMs.push({ batch: index + 1, size: batch.length, ms: Number(ms.toFixed(1)), networkMs: Number(networkMs.toFixed(1)) })
  mark(`verifyBatch${index + 1}`, { ms: Number(ms.toFixed(1)), networkMs: Number(networkMs.toFixed(1)) })
})

const verifyMs = performance.now() - verifyStart
const totalMs = performance.now() - runStarted
mark('runEnd', { totalMs: Number(totalMs.toFixed(1)) })

const report = {
  at: new Date().toISOString(),
  pdf: args.pdf,
  mcq: args.mcq,
  short: args.short,
  pages: source.pages.length,
  sourceChars: source.fullText.length,
  generateJobs: jobs.length,
  generated: generatedQuestions.length,
  verifyInput: toVerify.length,
  parseMs: Number(parseMs.toFixed(1)),
  generateMs: Number(generateMs.toFixed(1)),
  verifyMs: Number(verifyMs.toFixed(1)),
  totalMs: Number(totalMs.toFixed(1)),
  verifyBatchMs,
  marks,
}

await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
console.log(`\nWrote ${outPath}`)

function parseArgs(argv) {
  const out = { pdf: '7. Reproductive System.pdf', mcq: 20, short: 0 }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pdf') out.pdf = argv[++i]
    if (argv[i] === '--mcq') out.mcq = Number(argv[++i])
    if (argv[i] === '--short') out.short = Number(argv[++i])
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
