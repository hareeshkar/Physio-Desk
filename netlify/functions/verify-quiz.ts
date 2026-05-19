import type { Handler } from '@netlify/functions'
import {
  jsonResponse,
  parseJsonBody,
  safeError,
} from './_gemini'
import { resolveStudySource, withModelSourceText } from './_document'
import { verifyMiniMaxQuestions } from './_minimaxStudy'

interface VerifyQuizRequest {
  pdfSource?: unknown
  preparedSource?: unknown
  questions: unknown[]
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({})
  if (event.httpMethod !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const payload = parseJsonBody<VerifyQuizRequest>(event.body)
    const source = withModelSourceText(await resolveStudySource({
      pdfSource: payload.pdfSource,
      preparedSource: payload.preparedSource,
    }))
    const questions = Array.isArray(payload.questions) ? payload.questions : []
    const normalized = await verifyMiniMaxQuestions({ source, questions })
    const acceptedIds = new Set(
      normalized.results
        .filter((r) => r.verdict === 'accepted')
        .map((r) => r.questionId),
    )

    return jsonResponse({
      acceptedQuestions: questions.filter((q: any) => acceptedIds.has(q.id)),
      rejectedQuestions: normalized.results.filter((r) => r.verdict === 'rejected'),
      warnings: [...normalized.warnings, ...source.warnings],
    })
  } catch (error) {
    return safeError(error)
  }
}
