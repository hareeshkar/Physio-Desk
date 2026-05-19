import { generateQuiz, verifyQuiz, type PreparedSourcePayload } from './api'
import { planGenerateJobs } from './generateJobs'
import {
  dedupeStrings,
  type SourcePageRecord,
} from './sourceCoverage'
import { selectQuestionsForVerification } from './questionSelection'
import { chunkArray, mapWithConcurrency, planVerifyBatches } from './parallel'
import type { Question } from './types'

const VERIFY_CONCURRENCY = 2
const GENERATE_CONCURRENCY = 2
const FALLBACK_VERIFY_BATCH_SIZE = 4

export interface StudyPhaseTimings {
  generateMs: number
  verifyMs: number
  verifyBatches: Array<{ batch: number; size: number; ms: number }>
  generateChunks?: Array<{ chunk: number; ms: number }>
}

export async function generateQuizWithFullCoverage(args: {
  preparedSource: PreparedSourcePayload
  mode: string
  counts: { mcq: number; shortEssay: number }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
  onProgress?: (message: string) => void
  onTimings?: (timings: Partial<StudyPhaseTimings>) => void
}) {
  const pages = (args.preparedSource.pages ?? []) as SourcePageRecord[]
  const jobs = pages.length
    ? planGenerateJobs(pages, args.counts)
    : [{ pageNumbers: [] as number[], counts: args.counts }]

  const baseWarnings = dedupeStrings(args.preparedSource.warnings ?? [])
  const generateStart = performance.now()
  const generateChunkMs: Array<{ chunk: number; ms: number }> = []

  const chunkResults = await mapWithConcurrency(jobs, GENERATE_CONCURRENCY, async (job, index) => {
    const chunkStart = performance.now()
    const result = await generateChunkQuiz({
      ...args,
      chunk: { pageNumbers: job.pageNumbers, charCount: 0 },
      chunkIndex: index,
      chunkCount: jobs.length,
      counts: job.counts,
      baseWarnings,
    })
    generateChunkMs.push({ chunk: index + 1, ms: performance.now() - chunkStart })
    return result
  })

  const generateMs = performance.now() - generateStart
  args.onTimings?.({ generateMs, generateChunks: generateChunkMs })

  const allQuestions = chunkResults.flatMap((result) => result.questions)
  const allWarnings = dedupeStrings([
    ...baseWarnings,
    ...chunkResults.flatMap((result) => result.warnings),
  ])

  return {
    resourceTitle: args.preparedSource.fileName,
    questions: allQuestions,
    preparedSource: args.preparedSource,
    warnings: allWarnings,
  }
}

async function generateChunkQuiz(args: {
  preparedSource: PreparedSourcePayload
  mode: string
  counts: { mcq: number; shortEssay: number }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
  onProgress?: (message: string) => void
  chunk: { pageNumbers: number[]; charCount: number }
  chunkIndex: number
  chunkCount: number
  baseWarnings: string[]
}) {
  if (args.counts.mcq === 0 && args.counts.shortEssay === 0) {
    return { questions: [] as Question[], warnings: [] as string[] }
  }

  const label = args.chunk.pageNumbers.length
    ? `pages ${args.chunk.pageNumbers[0]}–${args.chunk.pageNumbers[args.chunk.pageNumbers.length - 1]}`
    : 'full note'

  const countLabel = [
    args.counts.mcq > 0 ? `${args.counts.mcq} MCQ` : '',
    args.counts.shortEssay > 0 ? `${args.counts.shortEssay} short` : '',
  ].filter(Boolean).join(' + ')

  args.onProgress?.(
    args.chunkCount > 1
      ? `Generating ${countLabel} from ${label} (${args.chunkIndex + 1}/${args.chunkCount})…`
      : 'Sending source text to MiniMax for questions…',
  )

  const generated = await generateQuiz({
    preparedSource: args.preparedSource,
    pageNumbers: args.chunk.pageNumbers.length ? args.chunk.pageNumbers : undefined,
    mode: args.mode,
    counts: args.counts,
    choiceCount: args.choiceCount,
    previousQuestions: args.previousQuestions,
  })

  return {
    questions: generated.questions,
    warnings: dedupeStrings(
      (generated.warnings ?? []).filter(
        (warning) => !args.baseWarnings.includes(warning),
      ),
    ),
  }
}

export async function verifyQuizInBatches(args: {
  preparedSource: PreparedSourcePayload
  questions: Question[]
  counts?: { mcq: number; shortEssay: number }
  onProgress?: (message: string) => void
  onTimings?: (timings: Partial<StudyPhaseTimings>) => void
}) {
  const questions = args.counts
    ? selectQuestionsForVerification(args.questions, args.counts)
    : args.questions

  const batchSizes = planVerifyBatches(questions.length)
  const batches = batchSizes.reduce<Question[][]>((groups, size) => {
    const start = groups.flat().length
    groups.push(questions.slice(start, start + size))
    return groups
  }, [])

  const verifyStart = performance.now()
  const verifyBatches: Array<{ batch: number; size: number; ms: number }> = []

  if (batches.length > 1) {
    args.onProgress?.(
      `Verifying ${questions.length} questions in ${batches.length} parallel batches…`,
    )
  } else if (questions.length) {
    args.onProgress?.('Verifying every question against the full source text…')
  }

  const batchResults = await mapWithConcurrency(batches, VERIFY_CONCURRENCY, async (batch, index) => {
    const batchStart = performance.now()
    const result = await verifyQuizBatchWithFallback({
      preparedSource: args.preparedSource,
      questions: batch,
    })
    verifyBatches.push({
      batch: index + 1,
      size: batch.length,
      ms: performance.now() - batchStart,
    })
    return result
  })

  const verifyMs = performance.now() - verifyStart
  args.onTimings?.({ verifyMs, verifyBatches })

  const accepted = batchResults.flatMap((result) => result.acceptedQuestions)
  const rejected = batchResults.flatMap((result) => result.rejectedQuestions)
  const warnings = dedupeStrings(batchResults.flatMap((result) => result.warnings ?? []))

  return {
    acceptedQuestions: accepted,
    rejectedQuestions: rejected,
    warnings,
  }
}

async function verifyQuizBatchWithFallback(args: {
  preparedSource: PreparedSourcePayload
  questions: Question[]
}) {
  try {
    return await verifyQuiz(args)
  } catch (error) {
    if (args.questions.length <= FALLBACK_VERIFY_BATCH_SIZE) {
      throw error
    }

    const subBatches = chunkArray(args.questions, FALLBACK_VERIFY_BATCH_SIZE)
    const results = await mapWithConcurrency(subBatches, VERIFY_CONCURRENCY, async (batch) =>
      verifyQuiz({
        preparedSource: args.preparedSource,
        questions: batch,
      }),
    )

    return {
      acceptedQuestions: results.flatMap((result) => result.acceptedQuestions),
      rejectedQuestions: results.flatMap((result) => result.rejectedQuestions),
      warnings: dedupeStrings(results.flatMap((result) => result.warnings ?? [])),
    }
  }
}
