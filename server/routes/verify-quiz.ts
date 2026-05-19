import { resolveStudySource } from '../_document.js'
import { verifyMiniMaxQuestions } from '../_minimaxStudy.js'
import { createTimer, formatTimingReport } from '../_timing.js'

export interface VerifyQuizRequest {
  pdfSource?: unknown
  preparedSource?: unknown
  questions: unknown[]
}

export async function handleVerifyQuiz(payload: VerifyQuizRequest) {
  const timer = createTimer('verify-quiz')
  timer.start('resolveSource')
  const source = await resolveStudySource({
    pdfSource: payload.pdfSource,
    preparedSource: payload.preparedSource,
  })
  timer.end({ sourceChars: source.fullText.length })

  const questions = Array.isArray(payload.questions) ? payload.questions : []
  let minimaxNetworkMs = 0
  timer.start('minimaxVerify', { questionCount: questions.length })
  const normalized = await verifyMiniMaxQuestions({
    source,
    questions,
    onNetworkMs: (durationMs) => {
      minimaxNetworkMs = durationMs
    },
  })
  timer.end({ minimaxNetworkMs: Math.round(minimaxNetworkMs) })
  const acceptedIds = new Set(
    normalized.results
      .filter((result) => result.verdict === 'accepted')
      .map((result) => result.questionId),
  )

  const timings = timer.toReport()

  return {
    acceptedQuestions: questions.filter((question: { id?: string }) => acceptedIds.has(question.id)),
    rejectedQuestions: normalized.results.filter((result) => result.verdict === 'rejected'),
    warnings: normalized.warnings,
    timings,
    timingsSummary: formatTimingReport(timings),
  }
}
