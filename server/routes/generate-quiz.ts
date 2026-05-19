import { requirePreparedSource, resolveStudySource } from '../_document.js'
import { generateMiniMaxQuiz } from '../_minimaxStudy.js'

export interface GenerateQuizRequest {
  pdfSource?: unknown
  preparedSource?: unknown
  pageNumbers?: number[]
  mode: string
  counts: {
    mcq: number
    shortEssay: number
  }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}

export async function handleGenerateQuiz(payload: GenerateQuizRequest) {
  const source = await resolveStudySource({
    pdfSource: payload.pdfSource,
    preparedSource: payload.preparedSource,
    pageNumbers: Array.isArray(payload.pageNumbers)
      ? payload.pageNumbers.filter((page): page is number => typeof page === 'number' && Number.isFinite(page))
      : undefined,
  })

  const generated = await generateMiniMaxQuiz({
    source,
    requestedMcq: payload.counts.mcq,
    requestedShort: payload.counts.shortEssay,
    choiceCount: payload.choiceCount,
    previousQuestions: payload.previousQuestions,
  })

  const preparedSource = payload.preparedSource
    ? requirePreparedSource(payload.preparedSource)
    : {
        fileName: source.fileName,
        fullText: source.fullText,
        pages: source.pages,
      }

  return {
    ...generated,
    preparedSource,
    warnings: generated.warnings,
  }
}
