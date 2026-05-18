import { describe, expect, it } from 'vitest'
import { normalizeEvaluationResponse } from '../functions/_studySchemas'

describe('normalizeEvaluationResponse', () => {
  it('derives essay correctness from score instead of trusting model boolean', () => {
    expect(normalizeEvaluationResponse({
      score: 2,
      isCorrect: true,
      feedback: 'Partial answer',
      sourceReminder: 'Quote',
      missingKeyPoints: ['Point'],
    }, 'evaluate-answer').isCorrect).toBe(false)

    expect(normalizeEvaluationResponse({
      score: 4,
      isCorrect: false,
      feedback: 'Good answer',
      sourceReminder: 'Quote',
      missingKeyPoints: [],
    }, 'evaluate-answer').isCorrect).toBe(true)
  })
})
