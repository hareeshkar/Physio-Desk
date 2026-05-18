import type { Question } from './types'

export interface ValidationResult {
  valid: boolean
  reasons: string[]
}

const UNSUPPORTED_EVIDENCE = new Set(['n/a', 'na', 'not available', 'unsupported'])

export function validateQuestion(
  question: Question,
  choiceCount: 4 | 5,
): ValidationResult {
  const reasons: string[] = []

  if (!question.prompt.trim()) {
    reasons.push('Question needs a prompt.')
  }

  if (!question.expectedAnswer.trim()) {
    reasons.push('Question needs an expected answer.')
  }

  if (!isUsefulEvidenceQuote(question.evidenceQuote)) {
    reasons.push('Question needs a source evidence quote.')
  }

  if (question.groundingConfidence === 'weak') {
    reasons.push('Question has weak grounding.')
  }

  if (question.type === 'mcq') {
    if (!question.choices || question.choices.length !== choiceCount) {
      reasons.push(`MCQ must include exactly ${choiceCount} choices.`)
    }

    const choiceIds = new Set(question.choices?.map((choice) => choice.id) ?? [])
    if (!question.correctChoiceId || !choiceIds.has(question.correctChoiceId)) {
      reasons.push('MCQ must include one correct choice id from the choices.')
    } else {
      const correctChoice = question.choices?.find((choice) => choice.id === question.correctChoiceId)
      if (
        correctChoice &&
        normalizeAnswer(correctChoice.text) !== normalizeAnswer(question.expectedAnswer)
      ) {
        reasons.push('MCQ expected answer must match the correct choice text.')
      }
    }
  }

  return { valid: reasons.length === 0, reasons }
}

export function filterUsableQuestions(
  questions: Question[],
  choiceCount: 4 | 5,
): { accepted: Question[]; rejected: Array<{ question: Question; reasons: string[] }> } {
  const seenPrompts = new Set<string>()
  const accepted: Question[] = []
  const rejected: Array<{ question: Question; reasons: string[] }> = []

  for (const question of questions) {
    const normalizedPrompt = normalizePrompt(question.prompt)
    const validation = validateQuestion(question, choiceCount)
    const reasons = [...validation.reasons]

    if (seenPrompts.has(normalizedPrompt)) {
      reasons.push('Question prompt is a duplicate.')
    }

    if (reasons.length > 0) {
      rejected.push({ question, reasons })
      continue
    }

    seenPrompts.add(normalizedPrompt)
    accepted.push(question)
  }

  return { accepted, rejected }
}

function isUsefulEvidenceQuote(value: string): boolean {
  const quote = value.trim()
  return quote.length >= 8 && !UNSUPPORTED_EVIDENCE.has(quote.toLowerCase())
}

function normalizePrompt(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeAnswer(value: string): string {
  return normalizePrompt(value).replace(/[.。]+$/u, '')
}
