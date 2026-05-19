import { generateQuiz, verifyQuiz, type PreparedSourcePayload } from './api'
import { planPageChunks, type SourcePageRecord } from './sourceCoverage'
import type { Question } from './types'

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

  const allQuestions: Question[] = []
  const allWarnings: string[] = [...(args.preparedSource.warnings ?? [])]

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    const label = chunk.pageNumbers?.length
      ? `pages ${chunk.pageNumbers[0]}–${chunk.pageNumbers[chunk.pageNumbers.length - 1]}`
      : 'full note'

    args.onProgress?.(
      chunks.length > 1
        ? `Generating questions from ${label} (${index + 1}/${chunks.length})…`
        : 'Sending source text to MiniMax for questions…',
    )

    const generated = await generateQuiz({
      preparedSource: args.preparedSource,
      pageNumbers: chunk.pageNumbers.length ? chunk.pageNumbers : undefined,
      mode: args.mode,
      counts: args.counts,
      choiceCount: args.choiceCount,
      previousQuestions: [
        ...(args.previousQuestions ?? []),
        ...allQuestions.map((question) => ({ prompt: question.prompt, topic: question.topic })),
      ],
    })

    allQuestions.push(...generated.questions)
    if (generated.warnings?.length) {
      allWarnings.push(...generated.warnings)
    }
  }

  return {
    resourceTitle: args.preparedSource.fileName,
    questions: allQuestions,
    preparedSource: args.preparedSource,
    warnings: allWarnings,
  }
}

export async function verifyQuizInBatches(args: {
  preparedSource: PreparedSourcePayload
  questions: Question[]
  batchSize?: number
  onProgress?: (message: string) => void
}) {
  const batchSize = args.batchSize ?? 4
  const accepted: Question[] = []
  const rejected: unknown[] = []
  const warnings: string[] = []

  for (let index = 0; index < args.questions.length; index += batchSize) {
    const batch = args.questions.slice(index, index + batchSize)
    if (args.questions.length > batchSize) {
      args.onProgress?.(`Verifying questions ${index + 1}–${index + batch.length} of ${args.questions.length}…`)
    } else {
      args.onProgress?.('Verifying every question against the full source text…')
    }

    const result = await verifyQuiz({
      preparedSource: args.preparedSource,
      questions: batch,
    })

    accepted.push(...result.acceptedQuestions)
    rejected.push(...result.rejectedQuestions)
    if (result.warnings?.length) warnings.push(...result.warnings)
  }

  return { acceptedQuestions: accepted, rejectedQuestions: rejected, warnings }
}
