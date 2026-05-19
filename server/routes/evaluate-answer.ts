import { resolveStudySource } from '../_document'
import { evaluateMiniMaxEssay } from '../_minimaxStudy'

export interface EvaluateAnswerRequest {
  pdfSource?: unknown
  preparedSource?: unknown
  question: {
    type: 'mcq' | 'short_essay'
    prompt: string
    choices?: Array<{ id: string; text: string }>
    correctChoiceId?: string
    expectedAnswer: string
    keyPoints: string[]
    evidenceQuote: string
  }
  userAnswer?: string
  selectedChoiceId?: string
  skipped?: boolean
}

export async function handleEvaluateAnswer(payload: EvaluateAnswerRequest) {
  const isMcq = payload.question.type === 'mcq'
  const localCorrect = isMcq
    ? payload.selectedChoiceId === payload.question.correctChoiceId
    : undefined

  if (payload.skipped) {
    return {
      score: 0,
      skipped: true,
      feedback: 'Skipped for later.',
      sourceReminder: payload.question.evidenceQuote,
      missingKeyPoints: payload.question.keyPoints,
    }
  }

  if (isMcq) {
    return {
      isCorrect: localCorrect,
      score: localCorrect ? 5 : 0,
      feedback: 'MCQ answers are checked locally from the generated correct option.',
      sourceReminder: payload.question.evidenceQuote,
      missingKeyPoints: localCorrect ? [] : payload.question.keyPoints,
    }
  }

  const source = await resolveStudySource({
    pdfSource: payload.pdfSource,
    preparedSource: payload.preparedSource,
  })
  const normalized = await evaluateMiniMaxEssay({
    source,
    question: payload.question,
    userAnswer: payload.skipped ? '[SKIPPED_BY_STUDENT]' : payload.userAnswer,
    skipped: payload.skipped,
  })

  return {
    ...normalized,
    skipped: payload.skipped,
    warnings: [...normalized.warnings, ...source.warnings],
  }
}
