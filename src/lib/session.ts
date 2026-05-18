import type { AnswerAttempt, Question, QuizSession } from './types'

export function buildSkippedAttempt({
  id,
  sessionId,
  question,
  createdAt,
}: {
  id: string
  sessionId: string
  question: Question
  createdAt: string
}): AnswerAttempt {
  return {
    id,
    sessionId,
    questionId: question.id,
    createdAt,
    feedback: 'Skipped for later.',
    sourceReminder: question.evidenceQuote,
    skipped: true,
    evaluationStatus: 'skipped',
  }
}

export function buildPendingEssayAttempt({
  id,
  sessionId,
  question,
  userAnswer,
  createdAt,
}: {
  id: string
  sessionId: string
  question: Question
  userAnswer: string
  createdAt: string
}): AnswerAttempt {
  return {
    id,
    sessionId,
    questionId: question.id,
    createdAt,
    userAnswer,
    feedback: 'Short answer saved. It will be checked against your note in Review.',
    sourceReminder: question.evidenceQuote,
    evaluationStatus: 'pending',
  }
}

export function createSessionSummary(session: QuizSession, attempts: AnswerAttempt[]) {
  const latestAttempts = [...getLatestAttemptsByQuestion(attempts).values()]
  const scoredAttempts = latestAttempts.filter((attempt) => typeof attempt.score === 'number')
  const correct = latestAttempts.filter((attempt) => attempt.isCorrect).length

  return {
    ...session,
    scoreSummary: {
      correct,
      total: latestAttempts.length,
      essayAverage:
        scoredAttempts.length > 0
          ? Math.round(
              scoredAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
                scoredAttempts.length,
            )
          : 0,
    },
  }
}

export function getWeakTopics(questions: Question[], attempts: AnswerAttempt[]) {
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const weakTopics = new Map<string, number>()

  for (const attempt of getLatestAttemptsByQuestion(attempts).values()) {
    const question = questionById.get(attempt.questionId)
    if (!question) continue

    const needsRevision =
      attempt.skipped ||
      attempt.isCorrect === false ||
      (typeof attempt.score === 'number' && attempt.score < 3) ||
      attempt.confidence === 'needs_revision'

    if (needsRevision) {
      weakTopics.set(question.topic, (weakTopics.get(question.topic) ?? 0) + 1)
    }
  }

  return [...weakTopics.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }))
}

export function orderQuestionsForSession(session: QuizSession, questions: Question[]) {
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const ordered = session.questionIds
    .map((questionId) => questionById.get(questionId))
    .filter((question): question is Question => Boolean(question))
  const orderedIds = new Set(ordered.map((question) => question.id))
  const extras = questions.filter((question) => !orderedIds.has(question.id))

  return [...ordered, ...extras]
}

export function getFirstUnansweredQuestionIndex(questions: Question[], attempts: AnswerAttempt[]) {
  if (!questions.length) return 0

  const firstUnanswered = questions.findIndex((question) => !isQuestionComplete(question.id, attempts))

  return firstUnanswered === -1 ? questions.length - 1 : firstUnanswered
}

export function getFirstIncompleteQuestionIndexAfter(
  questions: Question[],
  attempts: AnswerAttempt[],
  currentIndex: number,
) {
  if (!questions.length) return 0

  for (let index = currentIndex + 1; index < questions.length; index += 1) {
    if (!isQuestionComplete(questions[index].id, attempts)) return index
  }

  for (let index = 0; index <= currentIndex && index < questions.length; index += 1) {
    if (!isQuestionComplete(questions[index].id, attempts)) return index
  }

  return -1
}

export function getPracticeDestinationAfterAttempt(
  questions: Question[],
  attempts: AnswerAttempt[],
  currentIndex: number,
  sessionId: string,
) {
  const nextIncomplete = getFirstIncompleteQuestionIndexAfter(questions, attempts, currentIndex)
  if (nextIncomplete === -1 || allQuestionsAttempted(questions, attempts)) {
    return { kind: 'review' as const, to: `/review/${sessionId}` }
  }

  return { kind: 'question' as const, index: nextIncomplete }
}

export function getLatestAttemptsByQuestion(attempts: AnswerAttempt[]) {
  const latestByQuestion = new Map<string, AnswerAttempt>()

  for (const attempt of attempts) {
    const current = latestByQuestion.get(attempt.questionId)
    if (!current || compareAttemptsByCreatedAt(attempt, current) >= 0) {
      latestByQuestion.set(attempt.questionId, attempt)
    }
  }

  return latestByQuestion
}

export function isQuestionComplete(questionId: string, attempts: AnswerAttempt[]) {
  const latest = getLatestAttemptsByQuestion(attempts).get(questionId)
  return Boolean(latest && !latest.skipped)
}

export function isAttemptAwaitingEvaluation(attempt: AnswerAttempt) {
  return Boolean(
    attempt.userAnswer?.trim() &&
    !attempt.skipped &&
    attempt.evaluationStatus === 'pending',
  )
}

export function getSessionProgress(questions: Question[], attempts: AnswerAttempt[]) {
  const latestByQuestion = getLatestAttemptsByQuestion(attempts)
  const completed = questions.filter((question) => {
    const latest = latestByQuestion.get(question.id)
    return latest && !latest.skipped
  }).length
  const skipped = questions.filter((question) => latestByQuestion.get(question.id)?.skipped).length
  const total = questions.length
  const remaining = Math.max(0, total - completed)

  return {
    total,
    completed,
    skipped,
    remaining,
    isComplete: remaining === 0,
  }
}

function allQuestionsAttempted(questions: Question[], attempts: AnswerAttempt[]) {
  const latestByQuestion = getLatestAttemptsByQuestion(attempts)
  return questions.every((question) => latestByQuestion.has(question.id))
}

function compareAttemptsByCreatedAt(next: AnswerAttempt, current: AnswerAttempt) {
  const nextTime = parseAttemptCreatedAt(next.createdAt)
  const currentTime = parseAttemptCreatedAt(current.createdAt)

  if (Number.isNaN(nextTime) || Number.isNaN(currentTime)) {
    return next.createdAt.localeCompare(current.createdAt)
  }

  return nextTime - currentTime
}

function parseAttemptCreatedAt(createdAt: string) {
  const parsed = Date.parse(createdAt)
  if (!Number.isNaN(parsed)) return parsed

  const normalized = createdAt.replace(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/,
    (_match, year: string, month: string, day: string, rest: string) =>
      `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}${rest}`,
  )

  return Date.parse(normalized)
}
