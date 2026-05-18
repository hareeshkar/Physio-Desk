export type QuizModeId = 'quick' | 'exam' | 'custom'

export interface QuizMode {
  id: QuizModeId
  label: string
  description: string
  mcq: number
  shortEssay: number
}

export interface QuestionCounts {
  mcq: number
  shortEssay: number
}

export const DEFAULT_QUIZ_MODE_ID: QuizModeId = 'exam'

export const QUIZ_MODES: QuizMode[] = [
  {
    id: 'quick',
    label: 'Token-safe test round',
    description: 'Temporary local testing mode: 2 MCQs plus 1 short essay.',
    mcq: 2,
    shortEssay: 1,
  },
  {
    id: 'exam',
    label: 'Exam practice',
    description: 'Default: 10 MCQs plus 5 short essays for each uploaded note.',
    mcq: 10,
    shortEssay: 5,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Choose the mix that fits today.',
    mcq: 6,
    shortEssay: 3,
  },
]

export function getQuizMode(id: QuizModeId): QuizMode {
  return (
    QUIZ_MODES.find((mode) => mode.id === id) ??
    QUIZ_MODES.find((mode) => mode.id === DEFAULT_QUIZ_MODE_ID) ??
    QUIZ_MODES[0]
  )
}

export function normalizeQuestionCounts(counts: QuestionCounts): QuestionCounts {
  const mcq = clampWholeNumber(counts.mcq, 0, 50)
  const shortEssay = clampWholeNumber(counts.shortEssay, 0, 30)

  if (mcq + shortEssay < 1) {
    throw new Error('Choose at least one question.')
  }

  return { mcq, shortEssay }
}

function clampWholeNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
