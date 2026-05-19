import { generateQuiz, verifyQuiz, type PreparedSourcePayload } from './api'
import {
  dedupeStrings,
  planPageChunks,
  splitCountsAcrossChunks,
  type SourcePageRecord,
} from './sourceCoverage'
import { selectQuestionsForVerification } from './questionSelection'
import type { Question } from './types'

const DEFAULT_VERIFY_BATCH_SIZE = 8
const FALLBACK_VERIFY_BATCH_SIZE = 4

export async function generateQuizWithFullCoverage(args: {
  preparedSource: PreparedSourcePayload
  mode: string
  counts: { mcq: number; shortEssay: number }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
  onProgress?: (message: string) => void
}) {
  const pages = (args.preparedSource.pages ?? []) as SourcePageRecord[]
  const chunks = pages.length
    ? planPageChunks(pages)
    : [{ pageNumbers: [] as number[], charCount: args.preparedSource.fullText.length }]

  const chunkCount = chunks.length
  const baseWarnings = dedupeStrings(args.preparedSource.warnings ?? [])

  const chunkResults = chunkCount > 1
    ? await Promise.all(
        chunks.map((chunk, index) =>
          generateChunkQuiz({
            ...args,
            chunk,
            chunkIndex: index,
            chunkCount,
            baseWarnings,
          }),
        ),
      )
    : [
        await generateChunkQuiz({
          ...args,
          chunk: chunks[0],
          chunkIndex: 0,
          chunkCount: 1,
          baseWarnings,
        }),
      ]

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
  const counts = splitCountsAcrossChunks(args.counts, args.chunkIndex, args.chunkCount)
  if (counts.mcq === 0 && counts.shortEssay === 0) {
    return { questions: [] as Question[], warnings: [] as string[] }
  }

  const label = args.chunk.pageNumbers.length
    ? `pages ${args.chunk.pageNumbers[0]}–${args.chunk.pageNumbers[args.chunk.pageNumbers.length - 1]}`
    : 'full note'

  const countLabel = [
    counts.mcq > 0 ? `${counts.mcq} MCQ` : '',
    counts.shortEssay > 0 ? `${counts.shortEssay} short` : '',
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
    counts,
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
  batchSize?: number
  onProgress?: (message: string) => void
}) {
  const questions = args.counts
    ? selectQuestionsForVerification(args.questions, args.counts)
    : args.questions

  const accepted: Question[] = []
  const rejected: unknown[] = []
  const warnings: string[] = []
  const batchSize = args.batchSize ?? DEFAULT_VERIFY_BATCH_SIZE
  const totalBatches = Math.ceil(questions.length / batchSize) || 0

  for (let index = 0; index < questions.length; index += batchSize) {
    const batch = questions.slice(index, index + batchSize)
    const batchNumber = Math.floor(index / batchSize) + 1

    if (questions.length > batchSize) {
      args.onProgress?.(
        `Verifying questions ${index + 1}–${index + batch.length} of ${questions.length} (batch ${batchNumber}/${totalBatches})…`,
      )
    } else {
      args.onProgress?.('Verifying every question against the full source text…')
    }

    const result = await verifyQuizBatchWithFallback({
      preparedSource: args.preparedSource,
      questions: batch,
    })

    accepted.push(...result.acceptedQuestions)
    rejected.push(...result.rejectedQuestions)
    if (result.warnings?.length) {
      warnings.push(...dedupeStrings(result.warnings))
    }
  }

  return {
    acceptedQuestions: accepted,
    rejectedQuestions: rejected,
    warnings: dedupeStrings(warnings),
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

    const accepted: Question[] = []
    const rejected: unknown[] = []
    const warnings: string[] = []

    for (let index = 0; index < args.questions.length; index += FALLBACK_VERIFY_BATCH_SIZE) {
      const batch = args.questions.slice(index, index + FALLBACK_VERIFY_BATCH_SIZE)
      const result = await verifyQuiz({
        preparedSource: args.preparedSource,
        questions: batch,
      })
      accepted.push(...result.acceptedQuestions)
      rejected.push(...result.rejectedQuestions)
      if (result.warnings?.length) warnings.push(...result.warnings)
    }

    return {
      acceptedQuestions: accepted,
      rejectedQuestions: rejected,
      warnings: dedupeStrings(warnings),
    }
  }
}
