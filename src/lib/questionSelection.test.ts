import { describe, expect, it } from 'vitest'
import {
  hasExactQuestionCounts,
  missingQuestionCounts,
  selectQuestionsForSession,
  selectQuestionsForVerification,
} from './questionSelection'
import type { Question } from './types'

function makeQuestion(id: string, type: Question['type']): Question {
  return {
    id,
    sessionId: 'session-1',
    resourceId: 'resource-1',
    type,
    topic: 'Topic',
    prompt: `Prompt ${id}`,
    choices:
      type === 'mcq'
        ? [
            { id: 'A', text: 'A answer' },
            { id: 'B', text: 'B answer' },
            { id: 'C', text: 'C answer' },
            { id: 'D', text: 'D answer' },
          ]
        : undefined,
    correctChoiceId: type === 'mcq' ? 'A' : undefined,
    expectedAnswer: type === 'mcq' ? 'A answer' : 'Expected answer',
    keyPoints: ['Point'],
    explanation: 'Explanation',
    evidenceQuote: 'Grounded quote from the uploaded note.',
    groundingConfidence: 'strong',
    verificationStatus: 'accepted',
  }
}

describe('selectQuestionsForVerification', () => {
  it('caps verify input to requested counts plus buffer', () => {
    const questions = [
      ...Array.from({ length: 30 }, (_, index) => makeQuestion(`mcq-${index}`, 'mcq')),
      ...Array.from({ length: 10 }, (_, index) => makeQuestion(`short-${index}`, 'short_essay')),
    ]

    const selected = selectQuestionsForVerification(questions, { mcq: 20, shortEssay: 0 })

    expect(selected).toHaveLength(22)
    expect(selected.every((question) => question.type === 'mcq')).toBe(true)
  })
})

describe('missingQuestionCounts', () => {
  it('returns only the counts still needed', () => {
    const questions = [
      makeQuestion('mcq-1', 'mcq'),
      makeQuestion('mcq-2', 'mcq'),
      makeQuestion('short-1', 'short_essay'),
    ]

    expect(missingQuestionCounts(questions, { mcq: 5, shortEssay: 2 })).toEqual({
      mcq: 3,
      shortEssay: 1,
    })
  })
})

describe('selectQuestionsForSession', () => {
  it('returns exactly the requested MCQ and short essay counts', () => {
    const questions = [
      ...Array.from({ length: 12 }, (_, index) => makeQuestion(`mcq-${index}`, 'mcq')),
      ...Array.from({ length: 7 }, (_, index) => makeQuestion(`short-${index}`, 'short_essay')),
    ]

    const selected = selectQuestionsForSession(questions, { mcq: 10, shortEssay: 5 })

    expect(selected).toHaveLength(15)
    expect(selected.filter((question) => question.type === 'mcq')).toHaveLength(10)
    expect(selected.filter((question) => question.type === 'short_essay')).toHaveLength(5)
  })

  it('always returns MCQs before short essays even when input is mixed', () => {
    const questions = [
      makeQuestion('short-1', 'short_essay'),
      makeQuestion('mcq-1', 'mcq'),
      makeQuestion('short-2', 'short_essay'),
      makeQuestion('mcq-2', 'mcq'),
    ]

    const selected = selectQuestionsForSession(questions, { mcq: 2, shortEssay: 2 })

    expect(selected.map((question) => question.type)).toEqual(['mcq', 'mcq', 'short_essay', 'short_essay'])
  })

  it('supports zero counts for either question type', () => {
    const questions = [
      makeQuestion('mcq-1', 'mcq'),
      makeQuestion('short-1', 'short_essay'),
      makeQuestion('short-2', 'short_essay'),
    ]

    expect(selectQuestionsForSession(questions, { mcq: 0, shortEssay: 2 }).map((q) => q.type))
      .toEqual(['short_essay', 'short_essay'])
    expect(hasExactQuestionCounts(selectQuestionsForSession(questions, { mcq: 0, shortEssay: 2 }), { mcq: 0, shortEssay: 2 }))
      .toBe(true)
  })
})
