import { resolveStudySource } from '../_document.js'
import { verifyMiniMaxQuestions } from '../_minimaxStudy.js'

export interface VerifyQuizRequest {
  pdfSource?: unknown
  preparedSource?: unknown
  questions: unknown[]
}

export async function handleVerifyQuiz(payload: VerifyQuizRequest) {
  const source = await resolveStudySource({
    pdfSource: payload.pdfSource,
    preparedSource: payload.preparedSource,
  })
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  const normalized = await verifyMiniMaxQuestions({ source, questions })
  const acceptedIds = new Set(
    normalized.results
      .filter((result) => result.verdict === 'accepted')
      .map((result) => result.questionId),
  )

  return {
    acceptedQuestions: questions.filter((question: { id?: string }) => acceptedIds.has(question.id)),
    rejectedQuestions: normalized.results.filter((result) => result.verdict === 'rejected'),
    warnings: [...normalized.warnings, ...source.warnings],
  }
}
