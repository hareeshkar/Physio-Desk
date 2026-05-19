import type { Handler } from '@netlify/functions'
import {
  jsonResponse,
  parseJsonBody,
  safeError,
} from './_gemini'
import { prepareSourceDocument, requirePdfSource, withModelSourceText } from './_document'
import { generateMiniMaxQuiz } from './_minimaxStudy'

interface GenerateQuizRequest {
  pdfSource: unknown
  mode: string
  counts: {
    mcq: number
    shortEssay: number
  }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({})
  if (event.httpMethod !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const payload = parseJsonBody<GenerateQuizRequest>(event.body)
    const pdfSource = requirePdfSource(payload.pdfSource)
    const source = withModelSourceText(await prepareSourceDocument(pdfSource, {
      enableVlm: false,
    }))

    const generated = await generateMiniMaxQuiz({
      source,
      requestedMcq: payload.counts.mcq,
      requestedShort: payload.counts.shortEssay,
      choiceCount: payload.choiceCount,
      previousQuestions: payload.previousQuestions,
    })

    return jsonResponse({
      ...generated,
      preparedSource: {
        fileName: source.fileName,
        fullText: source.fullText,
      },
      warnings: [...generated.warnings, ...source.warnings],
    })
  } catch (error) {
    return safeError(error)
  }
}
