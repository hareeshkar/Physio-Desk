import { describe, expect, it } from 'vitest'
import { compactQuestionsForVerify } from '../_studyCompact'

describe('compactQuestionsForVerify', () => {
  it('drops explanation and keeps verify-critical fields', () => {
    const compact = compactQuestionsForVerify([
      {
        id: 'q1',
        type: 'mcq',
        prompt: 'Question?',
        explanation: 'Long explanation that should not be sent to verify.',
        expectedAnswer: 'A answer',
        evidenceQuote: 'quote',
        pageNumber: 2,
        correctChoiceId: 'A',
        choices: [{ id: 'A', text: 'A answer' }],
      },
    ])

    expect(compact[0]).toEqual({
      id: 'q1',
      type: 'mcq',
      prompt: 'Question?',
      expectedAnswer: 'A answer',
      evidenceQuote: 'quote',
      pageNumber: 2,
      correctChoiceId: 'A',
      choices: [{ id: 'A', text: 'A answer' }],
    })
  })
})
