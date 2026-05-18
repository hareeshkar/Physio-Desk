import type { Question } from './types'

export interface QuestionCounts {
  mcq: number
  shortEssay: number
}

export function selectQuestionsForSession(questions: Question[], counts: QuestionCounts): Question[] {
  const mcqs = questions.filter((question) => question.type === 'mcq').slice(0, counts.mcq)
  const shortEssays = questions
    .filter((question) => question.type === 'short_essay')
    .slice(0, counts.shortEssay)

  return [...mcqs, ...shortEssays]
}

export function hasExactQuestionCounts(questions: Question[], counts: QuestionCounts): boolean {
  return (
    questions.filter((question) => question.type === 'mcq').length === counts.mcq &&
    questions.filter((question) => question.type === 'short_essay').length === counts.shortEssay
  )
}
