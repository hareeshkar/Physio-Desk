import { GoogleGenAI, type types } from '@google/genai'
import { createPdfParser } from './_pdfRuntime'

export const MODEL_ID = 'gemini-3-flash-preview'
export const FALLBACK_MODEL_IDS = ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'] as const
export const EMBEDDING_MODEL_ID = 'models/gemini-embedding-2'

export const groundedSystemInstruction = `You are a strictly grounded physiotherapy study assistant. The attached PDF study resource is the only source of truth.

Rules:
1. Use only facts explicitly present in the attached PDF.
2. Do not use outside medical knowledge, common sense, or general anatomy knowledge unless it is directly stated in the source.
3. Do not infer missing details. If the source does not explicitly support an answer, mark it unsupported.
4. Every correct answer must include a short source quote copied from the PDF.
5. If you cannot find source evidence, do not create the question or mark the answer as unsupported.
6. Prefer exam-style wording that matches the uploaded note/tutorial closely.
7. Keep explanations separate from the precise answer. The precise answer must match the source.`

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }

  return new GoogleGenAI({ apiKey })
}

type GenerateContentClient = Pick<GoogleGenAI, 'models'>

export interface DirectPdfSource {
  fileName: string
  mimeType: 'application/pdf'
  base64: string
}

export function requirePdfSource(value: unknown): DirectPdfSource {
  const record = isRecord(value) ? value : {}
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : ''
  const base64 = typeof record.base64 === 'string' ? record.base64.trim() : ''

  if (mimeType !== 'application/pdf') {
    throw new Error('Only PDF direct document input is supported.')
  }

  if (!fileName || !base64) {
    throw new Error('PDF source must include fileName and base64 data.')
  }

  return { fileName, mimeType, base64 }
}

export function buildDirectPdfContents(instructions: string, source: DirectPdfSource): types.Content[] {
  return [
    {
      role: 'user',
      parts: [
        { text: instructions },
        {
          inlineData: {
            mimeType: source.mimeType,
            data: source.base64,
          },
        },
      ],
    },
  ]
}

export async function buildWholePdfTextContents(instructions: string, source: DirectPdfSource): Promise<string> {
  const parser = await createPdfParser({ data: Buffer.from(source.base64, 'base64') })

  try {
    const result = await parser.getText()
    const text = normalizeExtractedPdfText(result.text)

    if (!text) {
      throw new Error('Could not extract readable text from this PDF.')
    }

    return `${instructions}

Attached PDF source text extracted from ${source.fileName}:

${text}`
  } finally {
    await parser.destroy()
  }
}

function normalizeExtractedPdfText(text: string | undefined) {
  return (text ?? '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function generateContentWithFallback(
  ai: GenerateContentClient,
  params: types.GenerateContentParameters,
) {
  try {
    return await ai.models.generateContent(params)
  } catch (error) {
    if (!isGeminiHighDemandUnavailableError(error)) {
      throw error
    }

    for (const fallbackModel of FALLBACK_MODEL_IDS) {
      if (fallbackModel === params.model) continue

      try {
        return await ai.models.generateContent({
          ...params,
          model: fallbackModel,
        })
      } catch (fallbackError) {
        if (!isGeminiHighDemandUnavailableError(fallbackError)) {
          throw fallbackError
        }
      }
    }

    throw error
  }
}

export async function generateContentWithPdfFallback(
  ai: GenerateContentClient,
  params: Omit<types.GenerateContentParameters, 'contents'>,
  instructions: string,
  source: DirectPdfSource,
  buildTextContents = buildWholePdfTextContents,
) {
  try {
    return await generateContentWithFallback(ai, {
      ...params,
      contents: buildDirectPdfContents(instructions, source),
    })
  } catch (error) {
    if (!isDirectPdfDeniedError(error)) {
      throw error
    }

    return generateContentWithFallback(ai, {
      ...params,
      contents: await buildTextContents(instructions, source),
    })
  }
}

export function isDirectPdfDeniedError(error: unknown) {
  const details = extractErrorDetails(error)
  const message = details.message.toLowerCase()
  return (
    (details.statusCode === 403 || message.includes('"code":403') || message.includes('permission_denied'))
    && message.includes('denied access')
  )
}

export function isGeminiHighDemandUnavailableError(error: unknown) {
  const details = extractErrorDetails(error)
  const message = details.message.toLowerCase()

  return (
    details.statusCode === 503
    || details.statusCode === 502
    || (details.statusCode === 429 && isQuotaMessage(message))
    || details.status === 'UNAVAILABLE'
    || details.status === 'BAD GATEWAY'
    || (message.includes('unavailable') && isHighDemandMessage(message))
    || isHighDemandMessage(message)
  )
}

function extractErrorDetails(error: unknown) {
  const record = isRecord(error) ? error : {}
  const nested = isRecord(record.error) ? record.error : {}
  const statusCode = Number(record.status ?? record.code ?? nested.status ?? nested.code)
  const status = String(record.statusText ?? nested.status ?? record.code ?? '').toUpperCase()
  const message = [
    record.message,
    nested.message,
    record.details,
    nested.details,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  return { statusCode, status, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHighDemandMessage(message: string) {
  return (
    message.includes('overloaded')
    || message.includes('high demand')
    || message.includes('try again later')
    || message.includes('temporarily unavailable')
    || message.includes('temporary error')
  )
}

function isQuotaMessage(message: string) {
  return (
    message.includes('quota exceeded')
    || message.includes('resource exhausted')
  )
}

export const quizResponseSchema = {
  type: 'object',
  properties: {
    resourceTitle: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['mcq', 'short_essay'] },
          topic: { type: 'string' },
          prompt: { type: 'string' },
          choices: {
            type: 'array',
            nullable: true,
            minItems: 4,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
                text: { type: 'string' },
              },
              required: ['id', 'text'],
            },
          },
          correctChoiceId: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'], nullable: true },
          expectedAnswer: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          explanation: { type: 'string' },
          evidenceQuote: { type: 'string' },
          sourceTitle: { type: 'string', nullable: true },
          pageNumber: { type: 'number', nullable: true },
          groundingConfidence: { type: 'string', enum: ['strong', 'partial', 'weak'] },
        },
        required: [
          'id',
          'type',
          'topic',
          'prompt',
          'choices',
          'correctChoiceId',
          'expectedAnswer',
          'keyPoints',
          'explanation',
          'evidenceQuote',
          'groundingConfidence',
        ],
      },
    },
  },
  required: ['resourceTitle', 'questions'],
}

export const verificationSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionId: { type: 'string' },
          verdict: { type: 'string', enum: ['accepted', 'rejected'] },
          reason: { type: 'string' },
          supportedAnswer: { type: 'string' },
          sourceQuote: { type: 'string' },
          fixSuggestion: { type: 'string', nullable: true },
        },
        required: ['questionId', 'verdict', 'reason', 'supportedAnswer', 'sourceQuote'],
      },
    },
  },
  required: ['results'],
}

export const evaluationSchema = {
  type: 'object',
  properties: {
    isCorrect: { type: 'boolean', nullable: true },
    score: { type: 'number' },
    feedback: { type: 'string' },
    sourceReminder: { type: 'string' },
    missingKeyPoints: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'feedback', 'sourceReminder', 'missingKeyPoints'],
}

export interface GeneratedQuestion {
  id: string
  type: 'mcq' | 'short_essay'
  topic: string
  prompt: string
  choices: Array<{ id: string; text: string }>
  correctChoiceId?: string
  expectedAnswer: string
  keyPoints: string[]
  explanation: string
  evidenceQuote: string
  sourceTitle?: string
  pageNumber?: number
  groundingConfidence: 'strong' | 'partial' | 'weak'
}

export interface NormalizedQuizResponse {
  resourceTitle: string
  questions: GeneratedQuestion[]
  warnings: string[]
}

export interface NormalizedVerificationResult {
  questionId: string
  verdict: 'accepted' | 'rejected'
  reason: string
  supportedAnswer: string
  sourceQuote: string
  fixSuggestion?: string
}

export interface NormalizedVerificationResponse {
  results: NormalizedVerificationResult[]
  warnings: string[]
}

export interface NormalizedEvaluationResponse {
  isCorrect?: boolean
  score: number
  feedback: string
  sourceReminder: string
  missingKeyPoints: string[]
  warnings: string[]
}

export function normalizeQuizResponse(value: unknown, context: string): NormalizedQuizResponse {
  const warnings: string[] = []
  const record = toRecord(value, context, warnings)
  const questions = toArray(record.questions, 'questions', context, warnings)
    .map((question, index) => normalizeQuestion(question, index, context, warnings))

  return {
    resourceTitle: toOptionalString(record.resourceTitle) || 'Uploaded resource',
    questions,
    warnings,
  }
}

export function normalizeVerificationResponse(
  value: unknown,
  context: string,
): NormalizedVerificationResponse {
  const warnings: string[] = []
  const record = toRecord(value, context, warnings)
  const results = toArray(record.results, 'results', context, warnings)
    .map((result, index) => normalizeVerificationResult(result, index, context, warnings))
    .filter((result): result is NormalizedVerificationResult => Boolean(result))

  return { results, warnings }
}

export function normalizeEvaluationResponse(value: unknown, context: string): NormalizedEvaluationResponse {
  const warnings: string[] = []
  const record = toRecord(value, context, warnings)
  const score = typeof record.score === 'number' && Number.isFinite(record.score)
    ? Math.max(0, Math.min(5, record.score))
    : 0
  if (typeof record.score !== 'number' || !Number.isFinite(record.score)) {
    warnings.push(`${context}: score was not a number.`)
  }

  return {
    isCorrect: score >= 4,
    score,
    feedback: toOptionalString(record.feedback) || 'Gemini returned incomplete feedback. Please try again.',
    sourceReminder: toOptionalString(record.sourceReminder) || 'Review the source quote shown with this question.',
    missingKeyPoints: toStringArray(record.missingKeyPoints, 'missingKeyPoints', context, warnings),
    warnings,
  }
}

export function buildQuizPrompt(args: {
  requestedMcq: number
  requestedShort: number
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}) {
  const isTokenSafeRound = args.requestedMcq <= 2 && args.requestedShort <= 1
  const mcqCandidates = isTokenSafeRound ? args.requestedMcq : args.requestedMcq + 3
  const shortCandidates = isTokenSafeRound ? args.requestedShort : args.requestedShort + 2
  const priorQuestions = args.previousQuestions?.length
    ? `\nAvoid repeating or substantially rephrasing these previous questions/topics for this same note:\n${args.previousQuestions
        .slice(0, 40)
        .map((question, index) => `${index + 1}. [${question.topic}] ${question.prompt}`)
        .join('\n')}\n`
    : ''

  return `Read the entire attached PDF study resource before writing questions. Cover explicit exam-worthy facts across the whole document, including definitions, causes, clinical features, morphology, complications, tables, and diagrams when readable. Then create a physiotherapy revision quiz only from facts stated in the PDF.

Required output:
- Generate ${mcqCandidates} MCQ candidates and ${shortCandidates} short essay candidates so the app can keep exactly ${args.requestedMcq} MCQs and ${args.requestedShort} short essays after verification.
- Each MCQ must have exactly ${args.choiceCount} choices.
- MCQ choice ids must be ${args.choiceCount === 4 ? 'A, B, C, D' : 'A, B, C, D, E'}.
- Each MCQ must have exactly one correct choice, set in correctChoiceId.
- The correct choice text is the answer candidate and must exactly match expectedAnswer.
- Do not put the letter alone in expectedAnswer; use the full correct option text.
- The correct answer must be directly supported by the source quote.
- Distractors must be plausible but must not contradict the source quote.
- Each short essay question must include expected answer, key points, marking rubric, and source quote.
- Do not create any question if the answer is not explicit in the attached PDF.
- Include pageNumber when the PDF page can be identified.
- Avoid generating questions that are substantially similar to previous questions listed below.
- Return only JSON that matches the schema.`
    + priorQuestions
}

export function jsonResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
    body: JSON.stringify(body),
  }
}

export function safeError(error: unknown, statusCode = 500) {
  const details = extractErrorDetails(error)
  const message = details.statusCode === 403 && details.message.toLowerCase().includes('denied access')
    ? 'Gemini denied this API project access to the selected model. Check the API key/project permissions or use another enabled Gemini key.'
    : error instanceof Error ? error.message : 'Unexpected error'
  return jsonResponse({ error: message }, statusCode)
}

export function parseGeminiJson<T>(text: string | undefined | null, fallbackJson: string, context: string): T {
  const raw = text?.trim() || fallbackJson
  const candidates = [
    raw,
    extractJsonPayload(raw),
    repairCommonJsonIssues(raw),
    repairCommonJsonIssues(extractJsonPayload(raw)),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      return JSON.parse(candidate) as T
    } catch {
      // Try the next increasingly repaired candidate.
    }
  }

  throw new Error(`Invalid JSON from Gemini in ${context}. Preview: ${sanitizeGeminiPreview(raw)}`)
}

function normalizeQuestion(
  value: unknown,
  index: number,
  context: string,
  warnings: string[],
): GeneratedQuestion {
  const label = `question ${index + 1}`
  const record = toRecord(value, `${context}: ${label}`, warnings)
  const type = record.type === 'short_essay' ? 'short_essay' : 'mcq'
  const choices = toArray(record.choices, `${label} choices`, context, warnings)
    .map((choice, choiceIndex) => normalizeChoice(choice, choiceIndex, context, warnings))
    .filter((choice): choice is { id: string; text: string } => Boolean(choice))
  const confidence = record.groundingConfidence === 'partial' || record.groundingConfidence === 'weak'
    ? record.groundingConfidence
    : 'strong'
  const pageNumber = typeof record.pageNumber === 'number' && Number.isFinite(record.pageNumber)
    ? record.pageNumber
    : undefined

  return {
    id: toOptionalString(record.id),
    type,
    topic: toOptionalString(record.topic),
    prompt: toOptionalString(record.prompt),
    choices,
    correctChoiceId: toOptionalString(record.correctChoiceId) || undefined,
    expectedAnswer: toOptionalString(record.expectedAnswer),
    keyPoints: toStringArray(record.keyPoints, `${label} keyPoints`, context, warnings),
    explanation: toOptionalString(record.explanation),
    evidenceQuote: toOptionalString(record.evidenceQuote),
    sourceTitle: toOptionalString(record.sourceTitle) || undefined,
    pageNumber,
    groundingConfidence: confidence,
  }
}

function normalizeChoice(
  value: unknown,
  index: number,
  context: string,
  warnings: string[],
) {
  const record = toRecord(value, `${context}: choice ${index + 1}`, warnings)
  const id = toOptionalString(record.id)
  const text = toOptionalString(record.text)

  if (!id || !text) {
    warnings.push(`${context}: choice ${index + 1} was missing id or text.`)
    return null
  }

  return { id, text }
}

function normalizeVerificationResult(
  value: unknown,
  index: number,
  context: string,
  warnings: string[],
) {
  const record = toRecord(value, `${context}: result ${index + 1}`, warnings)
  const questionId = toOptionalString(record.questionId)
  const verdict = record.verdict === 'accepted' || record.verdict === 'rejected'
    ? record.verdict
    : undefined

  if (!questionId || !verdict) {
    warnings.push(`${context}: result ${index + 1} was missing questionId or verdict.`)
    return null
  }

  return {
    questionId,
    verdict,
    reason: toOptionalString(record.reason),
    supportedAnswer: toOptionalString(record.supportedAnswer),
    sourceQuote: toOptionalString(record.sourceQuote),
    fixSuggestion: toOptionalString(record.fixSuggestion) || undefined,
  }
}

function toRecord(value: unknown, context: string, warnings: string[]): Record<string, unknown> {
  if (isRecord(value)) return value

  warnings.push(`${context}: response was not an object.`)
  return {}
}

function toArray(value: unknown, field: string, context: string, warnings: string[]): unknown[] {
  if (Array.isArray(value)) return value

  warnings.push(`${context}: ${field} was not an array.`)
  return []
}

function toStringArray(value: unknown, field: string, context: string, warnings: string[]) {
  return toArray(value, field, context, warnings)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractJsonPayload(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')
  const starts = [objectStart, arrayStart].filter((index) => index >= 0)
  if (!starts.length) return text

  const start = Math.min(...starts)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))

  return end > start ? text.slice(start, end + 1).trim() : text
}

function repairCommonJsonIssues(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function sanitizeGeminiPreview(text: string) {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

export function parseJsonBody<T>(body: string | null): T {
  if (!body) {
    throw new Error('Missing request body.')
  }

  return JSON.parse(body) as T
}

export async function fileToBase64(eventBody: string, isBase64Encoded?: boolean) {
  return isBase64Encoded ? eventBody : Buffer.from(eventBody).toString('base64')
}
