import { getLatestAttemptsByQuestion, isAttemptAwaitingEvaluation } from './session'
import type { AnswerAttempt, EvaluationResult, Question } from './types'

export function getPendingEssayEvaluations(questions: Question[], attempts: AnswerAttempt[]) {
  const latestByQuestion = getLatestAttemptsByQuestion(attempts)

  return questions
    .filter((question) => question.type === 'short_essay')
    .map((question) => {
      const attempt = latestByQuestion.get(question.id)
      return attempt ? { question, attempt } : undefined
    })
    .filter((item): item is { question: Question; attempt: AnswerAttempt } =>
      Boolean(item && isAttemptAwaitingEvaluation(item.attempt)),
    )
}

export function isLatestAttempt(attempt: AnswerAttempt, attempts: AnswerAttempt[]) {
  return getLatestAttemptsByQuestion(attempts).get(attempt.questionId)?.id === attempt.id
}

export function buildStartedEssayEvaluationAttempt(
  attempt: AnswerAttempt,
  createdAt: string,
): AnswerAttempt {
  return {
    ...attempt,
    id: crypto.randomUUID(),
    createdAt,
    evaluationStatus: 'evaluating',
    evaluationError: undefined,
  }
}

export function buildRetryEssayEvaluationAttempt(
  attempt: AnswerAttempt,
  createdAt: string,
): AnswerAttempt {
  return {
    ...attempt,
    id: crypto.randomUUID(),
    createdAt,
    evaluationStatus: 'pending',
    evaluationError: undefined,
  }
}

export function buildEvaluatedEssayAttempt(
  attempt: AnswerAttempt,
  result: EvaluationResult,
  createdAt: string,
): AnswerAttempt {
  return {
    ...attempt,
    id: crypto.randomUUID(),
    createdAt,
    isCorrect: result.isCorrect,
    score: result.score,
    feedback: result.feedback,
    sourceReminder: result.sourceReminder,
    skipped: result.skipped,
    evaluationStatus: result.skipped ? 'skipped' : 'evaluated',
    missingKeyPoints: result.missingKeyPoints,
    warnings: result.warnings,
    evaluationError: undefined,
  }
}

export async function evaluatePendingEssayAttempt({
  attempt,
  attempts,
  evaluate,
  save,
  now,
}: {
  attempt: AnswerAttempt
  attempts: () => Promise<AnswerAttempt[]>
  evaluate: () => Promise<EvaluationResult>
  save: (attempt: AnswerAttempt) => Promise<void>
  now: () => string
}) {
  if (!isLatestAttempt(attempt, await attempts())) return

  try {
    const result = await evaluate()
    if (isLatestAttempt(attempt, await attempts())) {
      await save(buildEvaluatedEssayAttempt(attempt, result, now()))
    }
  } catch (error) {
    if (isLatestAttempt(attempt, await attempts())) {
      await save(buildFailedEssayEvaluationAttempt(attempt, error, now()))
    }
  }
}

export function buildFailedEssayEvaluationAttempt(
  attempt: AnswerAttempt,
  error: unknown,
  createdAt: string,
): AnswerAttempt {
  return {
    ...attempt,
    id: crypto.randomUUID(),
    createdAt,
    evaluationStatus: 'failed',
    evaluationError: error instanceof Error ? error.message : 'Could not check this short answer yet.',
  }
}
