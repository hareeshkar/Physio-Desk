import type { EvaluationResult, Question } from './types'

const functionBase = '/.netlify/functions'

export interface PdfSourcePayload {
  fileName: string
  mimeType: 'application/pdf'
  base64: string
}

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

export async function generateQuiz(payload: {
  pdfSource: PdfSourcePayload
  mode: string
  counts: { mcq: number; shortEssay: number }
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}) {
  return postJson<{ resourceTitle: string; questions: Question[]; warnings?: string[] }>(
    '/generate-quiz',
    payload,
  )
}

export async function verifyQuiz(payload: { pdfSource: PdfSourcePayload; questions: Question[] }) {
  return postJson<{ acceptedQuestions: Question[]; rejectedQuestions: unknown[]; warnings?: string[] }>(
    '/verify-quiz',
    payload,
  )
}

export async function evaluateAnswer(payload: {
  pdfSource: PdfSourcePayload
  question: Question
  userAnswer?: string
  selectedChoiceId?: string
  skipped?: boolean
}) {
  return postJson<EvaluationResult>('/evaluate-answer', payload)
}

export async function deleteRemoteStore(fileSearchStoreName: string) {
  return postJson<{ deleted: boolean }>('/delete-store', { fileSearchStoreName })
}

export async function pdfSourceFromFile(file: File): Promise<PdfSourcePayload> {
  if ((file.type || 'application/pdf') !== 'application/pdf') {
    throw new Error('MiniMax study generation currently supports PDF files only.')
  }

  return {
    fileName: file.name,
    mimeType: 'application/pdf',
    base64: await fileToBase64(file),
  }
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${functionBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error ?? 'Request failed')
  }

  return response.json() as Promise<T>
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
