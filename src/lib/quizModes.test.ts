import { describe, expect, it } from 'vitest'
import { DEFAULT_QUIZ_MODE_ID, getQuizMode, normalizeQuestionCounts } from './quizModes'

describe('quiz modes', () => {
  it('uses exam practice as the default generated quiz', () => {
    expect(DEFAULT_QUIZ_MODE_ID).toBe('exam')
    expect(getQuizMode(DEFAULT_QUIZ_MODE_ID)).toMatchObject({ mcq: 10, shortEssay: 5 })
  })

  it('allows custom mixes to skip either MCQs or short essays', () => {
    expect(normalizeQuestionCounts({ mcq: 0, shortEssay: 4 })).toEqual({ mcq: 0, shortEssay: 4 })
    expect(normalizeQuestionCounts({ mcq: 8, shortEssay: 0 })).toEqual({ mcq: 8, shortEssay: 0 })
  })

  it('rejects an empty custom mix', () => {
    expect(() => normalizeQuestionCounts({ mcq: 0, shortEssay: 0 })).toThrow(/at least one question/)
  })
})
