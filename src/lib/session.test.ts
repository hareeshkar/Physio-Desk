import { describe, expect, it } from 'vitest'
import {
  buildPendingEssayAttempt,
  buildSkippedAttempt,
  createSessionSummary,
  getPracticeDestinationAfterAttempt,
  getFirstIncompleteQuestionIndexAfter,
  getFirstUnansweredQuestionIndex,
  getLatestAttemptsByQuestion,
  getSessionProgress,
  isQuestionComplete,
  orderQuestionsForSession,
} from './session'
import type { AnswerAttempt, Question, QuizSession } from './types'

function makeQuestion(id: string): Question {
  return {
    id,
    sessionId: 'session-1',
    resourceId: 'resource-1',
    type: 'mcq',
    topic: 'Topic',
    prompt: id,
    choices: [
      { id: 'A', text: 'A answer' },
      { id: 'B', text: 'B answer' },
      { id: 'C', text: 'C answer' },
      { id: 'D', text: 'D answer' },
    ],
    correctChoiceId: 'A',
    expectedAnswer: 'A answer',
    keyPoints: ['Point'],
    explanation: 'Explanation',
    evidenceQuote: 'Grounded quote from the uploaded note.',
    groundingConfidence: 'strong',
    verificationStatus: 'accepted',
  }
}

function makeEssayQuestion(id: string): Question {
  return {
    ...makeQuestion(id),
    type: 'short_essay',
    choices: undefined,
    correctChoiceId: undefined,
    expectedAnswer: 'Expected source-backed answer',
  }
}

const session: QuizSession = {
  id: 'session-1',
  resourceId: 'resource-1',
  createdAt: '2026-01-01',
  mode: 'exam',
  choiceCount: 4,
  questionIds: ['q3', 'q1', 'q2'],
  status: 'active',
}

describe('session resume helpers', () => {
  it('builds a local skipped attempt without answer details', () => {
    const attempt = buildSkippedAttempt({
      id: 'attempt-1',
      sessionId: 'session-1',
      question: makeQuestion('q1'),
      createdAt: '2026-01-01T10:00:00.000Z',
    })

    expect(attempt).toMatchObject({
      id: 'attempt-1',
      sessionId: 'session-1',
      questionId: 'q1',
      createdAt: '2026-01-01T10:00:00.000Z',
      feedback: 'Skipped for later.',
      sourceReminder: 'Grounded quote from the uploaded note.',
      skipped: true,
    })
    expect(attempt.isCorrect).toBeUndefined()
    expect(attempt.score).toBeUndefined()
    expect(attempt.selectedChoiceId).toBeUndefined()
    expect(attempt.userAnswer).toBeUndefined()
  })

  it('builds a pending essay attempt that completes practice navigation without AI feedback yet', () => {
    const question = makeEssayQuestion('essay-1')
    const attempt = buildPendingEssayAttempt({
      id: 'attempt-1',
      sessionId: 'session-1',
      question,
      userAnswer: 'Portal pressure is increased.',
      createdAt: '2026-01-01T10:00:00.000Z',
    })

    expect(attempt).toMatchObject({
      id: 'attempt-1',
      sessionId: 'session-1',
      questionId: 'essay-1',
      userAnswer: 'Portal pressure is increased.',
      feedback: 'Short answer saved. It will be checked against your note in Review.',
      sourceReminder: 'Grounded quote from the uploaded note.',
      evaluationStatus: 'pending',
    })
    expect(isQuestionComplete('essay-1', [attempt])).toBe(true)
    expect(attempt.score).toBeUndefined()
    expect(attempt.isCorrect).toBeUndefined()
  })

  it('orders questions according to the session questionIds', () => {
    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])

    expect(ordered.map((question) => question.id)).toEqual(['q3', 'q1', 'q2'])
  })

  it('returns the first unanswered question index', () => {
    const attempts: AnswerAttempt[] = [
      {
        id: 'a1',
        sessionId: 'session-1',
        questionId: 'q3',
        createdAt: '2026-01-01',
        feedback: 'Done',
        sourceReminder: 'Quote',
      },
      {
        id: 'a2',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
      },
    ]

    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])

    expect(getFirstUnansweredQuestionIndex(ordered, attempts)).toBe(1)
  })

  it('latest non-skipped attempt completes a previously skipped question', () => {
    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])
    const attempts: AnswerAttempt[] = [
      {
        id: 'skip-q3',
        sessionId: 'session-1',
        questionId: 'q3',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
      },
      {
        id: 'answer-q3',
        sessionId: 'session-1',
        questionId: 'q3',
        createdAt: '2026-01-01T10:05:00.000Z',
        feedback: 'Done',
        sourceReminder: 'Quote',
        skipped: false,
      },
    ]

    expect(isQuestionComplete('q3', attempts)).toBe(true)
    expect(getLatestAttemptsByQuestion(attempts).get('q3')?.id).toBe('answer-q3')
    expect(getFirstUnansweredQuestionIndex(ordered, attempts)).toBe(1)
  })

  it('uses parsed timestamps and array order when resolving latest attempts', () => {
    const attempts: AnswerAttempt[] = [
      {
        id: 'non-iso-date',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-2-01T10:00:00.000Z',
        feedback: 'Older',
        sourceReminder: 'Quote',
      },
      {
        id: 'iso-date',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-11-01T10:00:00.000Z',
        feedback: 'Newer',
        sourceReminder: 'Quote',
      },
      {
        id: 'tie-wins',
        sessionId: 'session-1',
        questionId: 'q2',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Latest tie',
        sourceReminder: 'Quote',
      },
      {
        id: 'same-tie-wins',
        sessionId: 'session-1',
        questionId: 'q2',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Latest tie',
        sourceReminder: 'Quote',
      },
    ]

    const latest = getLatestAttemptsByQuestion(attempts)

    expect(latest.get('q1')?.id).toBe('iso-date')
    expect(latest.get('q2')?.id).toBe('same-tie-wins')
  })

  it('reports completed sessions only when every latest attempt is not skipped', () => {
    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])
    const attempts: AnswerAttempt[] = ordered.map((question) => ({
      id: `attempt-${question.id}`,
      sessionId: 'session-1',
      questionId: question.id,
      createdAt: '2026-01-01',
      feedback: 'Done',
      sourceReminder: 'Quote',
    }))

    expect(getSessionProgress(ordered, attempts)).toEqual({
      total: 3,
      completed: 3,
      skipped: 0,
      remaining: 0,
      isComplete: true,
    })
    expect(getFirstUnansweredQuestionIndex(ordered, attempts)).toBe(2)
  })

  it('treats empty sessions as complete progress', () => {
    expect(getSessionProgress([], [])).toEqual({
      total: 0,
      completed: 0,
      skipped: 0,
      remaining: 0,
      isComplete: true,
    })
  })

  it('builds summaries from latest attempts only', () => {
    const attempts: AnswerAttempt[] = [
      {
        id: 'old-wrong',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:00:00.000Z',
        isCorrect: false,
        score: 0,
        feedback: 'Wrong',
        sourceReminder: 'Quote',
      },
      {
        id: 'new-correct',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:01:00.000Z',
        isCorrect: true,
        score: 5,
        feedback: 'Correct',
        sourceReminder: 'Quote',
      },
    ]

    expect(createSessionSummary(session, attempts).scoreSummary).toEqual({
      correct: 1,
      total: 1,
      essayAverage: 5,
    })
  })

  it('uses latest attempts when finding weak topics', async () => {
    const { getWeakTopics } = await import('./session')
    const questions = [makeQuestion('q1')]
    const attempts: AnswerAttempt[] = [
      {
        id: 'wrong-q1',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:00:00.000Z',
        isCorrect: false,
        feedback: 'Wrong',
        sourceReminder: 'Quote',
      },
      {
        id: 'correct-q1',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:05:00.000Z',
        isCorrect: true,
        score: 5,
        feedback: 'Correct',
        sourceReminder: 'Quote',
      },
    ]

    expect(getWeakTopics(questions, attempts)).toEqual([])
  })

  it('finds the next incomplete question after the current index without looping back to a skipped current question', () => {
    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])
    const attempts: AnswerAttempt[] = [
      {
        id: 'done-q3',
        sessionId: 'session-1',
        questionId: 'q3',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Done',
        sourceReminder: 'Quote',
      },
      {
        id: 'skip-q1',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:01:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
      },
    ]

    expect(getFirstIncompleteQuestionIndexAfter(ordered, attempts, 1)).toBe(2)
  })

  it('wraps to earlier skipped questions when the current question is the physical last item', () => {
    const ordered = orderQuestionsForSession(session, [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')])
    const attempts: AnswerAttempt[] = [
      {
        id: 'done-q3',
        sessionId: 'session-1',
        questionId: 'q3',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Done',
        sourceReminder: 'Quote',
      },
      {
        id: 'skip-q1',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:01:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
      },
      {
        id: 'skip-q2',
        sessionId: 'session-1',
        questionId: 'q2',
        createdAt: '2026-01-01T10:02:00.000Z',
        feedback: 'Skipped',
        sourceReminder: 'Quote',
        skipped: true,
      },
    ]

    expect(getFirstIncompleteQuestionIndexAfter(ordered, attempts, 2)).toBe(1)
  })

  it('routes to review after the last question has been attempted even when it was skipped', () => {
    const ordered = [makeQuestion('q1'), makeQuestion('q2'), makeEssayQuestion('q3')]
    const attempts: AnswerAttempt[] = [
      {
        id: 'done-q1',
        sessionId: 'session-1',
        questionId: 'q1',
        createdAt: '2026-01-01T10:00:00.000Z',
        feedback: 'Done',
        sourceReminder: 'Quote',
      },
      {
        id: 'done-q2',
        sessionId: 'session-1',
        questionId: 'q2',
        createdAt: '2026-01-01T10:01:00.000Z',
        feedback: 'Done',
        sourceReminder: 'Quote',
      },
      buildSkippedAttempt({
        id: 'skip-q3',
        sessionId: 'session-1',
        question: ordered[2],
        createdAt: '2026-01-01T10:02:00.000Z',
      }),
    ]

    expect(getPracticeDestinationAfterAttempt(ordered, attempts, 2, 'session-1')).toEqual({
      kind: 'review',
      to: '/review/session-1',
    })
  })
})
