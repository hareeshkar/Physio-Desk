import type { Handler } from '@netlify/functions'
import {
  jsonResponse,
  parseJsonBody,
  safeError,
} from './_gemini'
import { prepareSourceDocument, requirePdfSource } from './_document'
import { evaluateMiniMaxEssay } from './_minimaxStudy'

interface EvaluateAnswerRequest {
  pdfSource: unknown
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

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({})
  if (event.httpMethod !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const payload = parseJsonBody<EvaluateAnswerRequest>(event.body)
    const isMcq = payload.question.type === 'mcq'
    const localCorrect = isMcq
      ? payload.selectedChoiceId === payload.question.correctChoiceId
      : undefined

    if (payload.skipped) {
      return jsonResponse({
        score: 0,
        skipped: true,
        feedback: 'Skipped for later.',
        sourceReminder: payload.question.evidenceQuote,
        missingKeyPoints: payload.question.keyPoints,
      })
    }

    const pdfSource = requirePdfSource(payload.pdfSource)

    if (isMcq) {
      return jsonResponse({
        isCorrect: localCorrect,
        score: localCorrect ? 5 : 0,
        feedback: payload.skipped
          ? 'The student skipped this MCQ. It should be marked for revision.'
          : 'MCQ answers are checked locally from the generated correct option.',
        sourceReminder: payload.question.evidenceQuote,
        missingKeyPoints: localCorrect ? [] : payload.question.keyPoints,
      })
    }

    const source = await prepareSourceDocument(pdfSource, { enableVlm: false })
    const normalized = await evaluateMiniMaxEssay({
      source,
      question: payload.question,
      userAnswer: payload.skipped
        ? '[SKIPPED_BY_STUDENT]'
        : payload.userAnswer,
      skipped: payload.skipped,
    })
    return jsonResponse({
      ...normalized,
      skipped: payload.skipped,
      warnings: [...normalized.warnings, ...source.warnings],
    })
  } catch (error) {
    return safeError(error)
  }
}
