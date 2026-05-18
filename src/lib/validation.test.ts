import { describe, expect, it } from 'vitest'
import { filterUsableQuestions, validateQuestion } from './validation'
import type { Question } from './types'

const validMcq: Question = {
  id: 'q1',
  sessionId: 's1',
  resourceId: 'r1',
  type: 'mcq',
  topic: 'Gait',
  prompt: 'Which muscle stabilizes the pelvis during single-leg stance?',
  choices: [
    { id: 'A', text: 'Gluteus medius' },
    { id: 'B', text: 'Biceps femoris' },
    { id: 'C', text: 'Gastrocnemius' },
    { id: 'D', text: 'Tibialis anterior' },
  ],
  correctChoiceId: 'A',
  expectedAnswer: 'Gluteus medius',
  keyPoints: ['Stabilizes pelvis', 'Single-leg stance'],
  explanation: 'The note links gluteus medius to pelvic stability.',
  evidenceQuote:
    'The gluteus medius abducts the hip and stabilizes the pelvis during single-leg stance.',
  sourceTitle: 'physio-note.txt',
  groundingConfidence: 'strong',
  verificationStatus: 'pending',
}

describe('validateQuestion', () => {
  it('accepts a grounded MCQ with the configured choice count', () => {
    expect(validateQuestion(validMcq, 4)).toEqual({ valid: true, reasons: [] })
  })

  it('rejects an MCQ with the wrong number of choices', () => {
    const question = { ...validMcq, choices: validMcq.choices?.slice(0, 3) }

    expect(validateQuestion(question, 4).valid).toBe(false)
    expect(validateQuestion(question, 4).reasons).toContain(
      'MCQ must include exactly 4 choices.',
    )
  })

  it('rejects MCQs whose answer text does not match the correct choice text', () => {
    const question = { ...validMcq, expectedAnswer: 'Gluteus medius muscle' }

    expect(validateQuestion(question, 4).reasons).toContain(
      'MCQ expected answer must match the correct choice text.',
    )
  })

  it('rejects weak grounding and missing evidence', () => {
    const question = {
      ...validMcq,
      evidenceQuote: '',
      groundingConfidence: 'weak' as const,
    }

    expect(validateQuestion(question, 4).reasons).toEqual(
      expect.arrayContaining([
        'Question needs a source evidence quote.',
        'Question has weak grounding.',
      ]),
    )
  })
})

describe('filterUsableQuestions', () => {
  it('removes duplicate prompts and invalid questions', () => {
    const duplicate = { ...validMcq, id: 'q2' }
    const invalid = {
      ...validMcq,
      id: 'q3',
      prompt: 'What is unsupported?',
      evidenceQuote: 'N/A',
    }

    const result = filterUsableQuestions([validMcq, duplicate, invalid], 4)

    expect(result.accepted.map((question) => question.id)).toEqual(['q1'])
    expect(result.rejected).toHaveLength(2)
  })
})
