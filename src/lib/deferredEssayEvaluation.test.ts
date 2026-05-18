import { describe, expect, it } from 'vitest'
import {
  buildEvaluatedEssayAttempt,
  buildFailedEssayEvaluationAttempt,
  buildRetryEssayEvaluationAttempt,
  buildStartedEssayEvaluationAttempt,
  evaluatePendingEssayAttempt,
  getPendingEssayEvaluations,
  isLatestAttempt,
} from './deferredEssayEvaluation'
import type { AnswerAttempt, Question } from './types'

function essayQuestion(id: string): Question {
  return {
    id,
    sessionId: 'session-1',
    resourceId: 'resource-1',
    type: 'short_essay',
    topic: 'Topic',
    prompt: id,
    expectedAnswer: 'Expected answer',
    keyPoints: ['Point'],
    explanation: 'Explanation',
    evidenceQuote: 'Source quote',
    groundingConfidence: 'strong',
    verificationStatus: 'accepted',
  }
}

function mcqQuestion(id: string): Question {
  return {
    ...essayQuestion(id),
    type: 'mcq',
    choices: [
      { id: 'A', text: 'A answer' },
      { id: 'B', text: 'B answer' },
      { id: 'C', text: 'C answer' },
      { id: 'D', text: 'D answer' },
    ],
    correctChoiceId: 'A',
  }
}

describe('deferred essay evaluation selection', () => {
  it('selects only latest typed pending essay attempts and excludes skipped, failed, or already evaluating attempts', () => {
    const questions = [essayQuestion('essay-1'), essayQuestion('essay-2'), essayQuestion('essay-3'), mcqQuestion('mcq-1')]
    const attempts: AnswerAttempt[] = [
      {
        id: 'old-skipped',
        sessionId: 'session-1',
        questionId: 'essay-1',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
        evaluationStatus: 'skipped',
      },
      {
        id: 'latest-pending',
        sessionId: 'session-1',
        questionId: 'essay-1',
        createdAt: '2026-01-01T10:05:00.000Z',
        userAnswer: 'Typed answer',
        feedback: 'Pending',
        sourceReminder: 'Quote',
        evaluationStatus: 'pending',
      },
      {
        id: 'skipped-only',
        sessionId: 'session-1',
        questionId: 'essay-2',
        createdAt: '2026-01-01T10:10:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
        evaluationStatus: 'skipped',
      },
      {
        id: 'failed-is-not-auto-retried',
        sessionId: 'session-1',
        questionId: 'essay-3',
        createdAt: '2026-01-01T10:15:00.000Z',
        userAnswer: 'Typed failed answer',
        feedback: 'Pending',
        sourceReminder: 'Quote',
        evaluationStatus: 'failed',
      },
      {
        id: 'evaluating-is-included',
        sessionId: 'session-1',
        questionId: 'essay-3',
        createdAt: '2026-01-01T10:17:00.000Z',
        userAnswer: 'Typed evaluating answer',
        feedback: 'Pending',
        sourceReminder: 'Quote',
        evaluationStatus: 'evaluating',
      },
      {
        id: 'mcq-pending-is-ignored',
        sessionId: 'session-1',
        questionId: 'mcq-1',
        createdAt: '2026-01-01T10:20:00.000Z',
        userAnswer: '',
        feedback: 'Pending',
        sourceReminder: 'Quote',
        evaluationStatus: 'pending',
      },
    ]

    expect(getPendingEssayEvaluations(questions, attempts).map((item) => item.attempt.id)).toEqual([
      'latest-pending',
    ])
  })

  it('builds evaluated and failed follow-up attempts without losing the typed answer', () => {
    const pending: AnswerAttempt = {
      id: 'pending',
      sessionId: 'session-1',
      questionId: 'essay-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      userAnswer: 'Typed answer',
      feedback: 'Pending',
      sourceReminder: 'Quote',
      evaluationStatus: 'pending',
    }

    const evaluated = buildEvaluatedEssayAttempt(pending, {
      isCorrect: true,
      score: 4,
      feedback: 'RESULT: Correct\n\nWHY: Meaning matches.',
      sourceReminder: 'Source quote',
      missingKeyPoints: [],
      warnings: ['visual note unavailable'],
    }, '2026-01-01T10:01:00.000Z')

    expect(evaluated).toMatchObject({
      questionId: 'essay-1',
      userAnswer: 'Typed answer',
      score: 4,
      isCorrect: true,
      evaluationStatus: 'evaluated',
      missingKeyPoints: [],
      warnings: ['visual note unavailable'],
    })
    expect(evaluated.id).not.toBe('pending')

    const failed = buildFailedEssayEvaluationAttempt(pending, new Error('MiniMax busy'), '2026-01-01T10:02:00.000Z')

    expect(failed).toMatchObject({
      questionId: 'essay-1',
      userAnswer: 'Typed answer',
      evaluationStatus: 'failed',
      evaluationError: 'MiniMax busy',
    })
    expect(failed.id).not.toBe('pending')
  })

  it('marks an attempt evaluating and supports explicit retry from failed state', () => {
    const pending: AnswerAttempt = {
      id: 'pending',
      sessionId: 'session-1',
      questionId: 'essay-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      userAnswer: 'Typed answer',
      feedback: 'Pending',
      sourceReminder: 'Quote',
      evaluationStatus: 'pending',
    }

    const evaluating = buildStartedEssayEvaluationAttempt(pending, '2026-01-01T10:01:00.000Z')
    const retry = buildRetryEssayEvaluationAttempt({ ...pending, evaluationStatus: 'failed' }, '2026-01-01T10:02:00.000Z')

    expect(evaluating).toMatchObject({
      questionId: 'essay-1',
      userAnswer: 'Typed answer',
      evaluationStatus: 'evaluating',
    })
    expect(retry).toMatchObject({
      questionId: 'essay-1',
      userAnswer: 'Typed answer',
      evaluationStatus: 'pending',
      evaluationError: undefined,
    })
  })

  it('checks whether an attempt is still the latest before saving async results', () => {
    const pending: AnswerAttempt = {
      id: 'pending',
      sessionId: 'session-1',
      questionId: 'essay-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      userAnswer: 'Typed answer',
      feedback: 'Pending',
      sourceReminder: 'Quote',
      evaluationStatus: 'pending',
    }

    expect(isLatestAttempt(pending, [pending])).toBe(true)
    expect(isLatestAttempt(pending, [
      pending,
      {
        ...pending,
        id: 'newer',
        createdAt: '2026-01-01T10:05:00.000Z',
      },
    ])).toBe(false)
  })

  it('saves one evaluated attempt after a successful retry evaluation', async () => {
    const pending: AnswerAttempt = {
      id: 'pending',
      sessionId: 'session-1',
      questionId: 'essay-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      userAnswer: 'Typed answer',
      feedback: 'Pending',
      sourceReminder: 'Quote',
      evaluationStatus: 'pending',
    }
    const saved: AnswerAttempt[] = []

    await evaluatePendingEssayAttempt({
      attempt: pending,
      attempts: async () => saved.length ? [pending, ...saved] : [pending],
      evaluate: async () => ({
        isCorrect: false,
        score: 0,
        feedback: 'Your answer does not address the question.',
        sourceReminder: 'Source reminder',
        missingKeyPoints: ['Point'],
      }),
      save: async (attempt) => {
        saved.push(attempt)
      },
      now: () => '2026-01-01T10:01:00.000Z',
    })

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      questionId: 'essay-1',
      userAnswer: 'Typed answer',
      evaluationStatus: 'evaluated',
      isCorrect: false,
      score: 0,
      feedback: 'Your answer does not address the question.',
      missingKeyPoints: ['Point'],
    })
  })
})
