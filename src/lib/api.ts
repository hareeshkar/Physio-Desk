import type { EvaluationResult, PreparedSource, Question } from './types'

const functionBase = import.meta.env.VITE_API_BASE ?? '/api'
const MAX_PDF_UPLOAD_BYTES = 4 * 1024 * 1024

export type PreparedSourcePayload = PreparedSource

export interface PdfSourcePayload {
  fileName: string
  mimeType: 'application/pdf'
  base64: string
}

export type StudySourcePayload =
  | { preparedSource: PreparedSourcePayload; pdfSource?: never }
  | { pdfSource: PdfSourcePayload; preparedSource?: never }

export async function uploadResourceFile(file: File) {
  const base64 = await fileToBase64(file)
  return postJson<{
    fileSearchStoreName: string
    documentName?: string
    mimeType: string
    displayName: string
  }>('/upload-resource', {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64,
  })
}

export async function generateQuiz(payload: StudySourcePayload & {
  pageNumbers?: number[]
  mode: string
  counts: { mcq: number; shortEssay: number }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}) {
  return postJson<{
    resourceTitle: string
    questions: Question[]
    preparedSource?: PreparedSourcePayload
    warnings?: string[]
  }>(
    '/generate-quiz',
    payload,
    { timeoutMs: 180_000 },
  )
}

export async function verifyQuiz(payload: StudySourcePayload & {
  questions: Question[]
}) {
  return postJson<{ acceptedQuestions: Question[]; rejectedQuestions: unknown[]; warnings?: string[] }>(
    '/verify-quiz',
    payload,
    { timeoutMs: 180_000 },
  )
}

export async function evaluateAnswer(payload: StudySourcePayload & {
  question: Question
  userAnswer?: string
  selectedChoiceId?: string
  skipped?: boolean
}) {
  return postJson<EvaluationResult>('/evaluate-answer', payload, { timeoutMs: 180_000 })
}

export async function deleteRemoteStore(fileSearchStoreName: string) {
  return postJson<{ deleted: boolean }>('/delete-store', { fileSearchStoreName })
}

/** Legacy fallback when prepared text is unavailable. */
export async function pdfSourceFromFile(file: File): Promise<PdfSourcePayload> {
  if ((file.type || 'application/pdf') !== 'application/pdf') {
    throw new Error('MiniMax study generation currently supports PDF files only.')
  }

  if (file.size > MAX_PDF_UPLOAD_BYTES) {
    throw new Error('This PDF is too large for server processing. Try a file under 4 MB or export a shorter version.')
  }

  return {
    fileName: file.name,
    mimeType: 'application/pdf',
    base64: await fileToBase64(file),
  }
}

async function postJson<T>(
  path: string,
  payload: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined

  let response: Response
  try {
    response = await fetch(`${functionBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'The study server took too long to respond. Try fewer questions or try again in a moment.',
      )
    }

    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const rawBody = await response.text()

  if (!response.ok) {
    throw new Error(parseApiError(rawBody, contentType, response.status))
  }

  if (!contentType.includes('application/json')) {
    throw new Error(parseApiError(rawBody, contentType, response.status))
  }

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw new Error('The study server returned an invalid response. Please try again.')
  }
}

function parseApiError(rawBody: string, contentType: string, status: number) {
  if (rawBody.includes('Inactivity Timeout') || rawBody.includes('FUNCTION_INVOCATION_TIMEOUT')) {
    return 'The server timed out. Your note text is stored on this device — try quick mode or retry in a moment.'
  }

  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawBody) as { error?: string }
      if (parsed.error) return parsed.error
    } catch {
      // Fall through to generic message.
    }
  }

  if (status === 504 || status === 502) {
    return 'The study server timed out. Try fewer questions or retry in a moment.'
  }

  return 'Request failed'
}

export function fileToBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.readAsDataURL(file)
  })
}
