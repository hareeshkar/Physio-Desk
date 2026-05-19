import type { Question } from './types'

export interface QuestionCounts {
  mcq: number
  shortEssay: number
}

/** Cap verify API calls to requested counts plus a small generation buffer. */
export function selectQuestionsForVerification(
  questions: Question[],
  counts: QuestionCounts,
  options: { mcqBuffer?: number; shortBuffer?: number } = {},
): Question[] {
  const mcqBuffer = options.mcqBuffer ?? 2
  const shortBuffer = options.shortBuffer ?? 1
  const mcqLimit = counts.mcq > 0 ? counts.mcq + mcqBuffer : 0
  const shortLimit = counts.shortEssay > 0 ? counts.shortEssay + shortBuffer : 0
  const mcqs = questions.filter((question) => question.type === 'mcq').slice(0, mcqLimit)
  const shortEssays = questions
    .filter((question) => question.type === 'short_essay')
    .slice(0, shortLimit)

  return [...mcqs, ...shortEssays]
}

export function selectQuestionsForSession(questions: Question[], counts: QuestionCounts): Question[] {
  const mcqs = questions.filter((question) => question.type === 'mcq').slice(0, counts.mcq)
  const shortEssays = questions
    .filter((question) => question.type === 'short_essay')
    .slice(0, counts.shortEssay)

  return [...mcqs, ...shortEssays]
}

export function missingQuestionCounts(
  questions: Question[],
  target: QuestionCounts,
): QuestionCounts {
  return {
    mcq: Math.max(0, target.mcq - questions.filter((question) => question.type === 'mcq').length),
    shortEssay: Math.max(
      0,
      target.shortEssay - questions.filter((question) => question.type === 'short_essay').length,
    ),
  }
}

export function hasExactQuestionCounts(questions: Question[], counts: QuestionCounts): boolean {
  return (
    questions.filter((question) => question.type === 'mcq').length === counts.mcq &&
    questions.filter((question) => question.type === 'short_essay').length === counts.shortEssay
  )
}
