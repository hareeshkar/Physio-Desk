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
    description: 'Set MCQs and short essays with the fields below.',
    mcq: 0,
    shortEssay: 0,
  },
]

export function formatQuestionMix(counts: QuestionCounts) {
  const parts: string[] = []
  if (counts.mcq > 0) {
    parts.push(`${counts.mcq} MCQ${counts.mcq === 1 ? '' : 's'}`)
  }
  if (counts.shortEssay > 0) {
    parts.push(`${counts.shortEssay} short essay${counts.shortEssay === 1 ? '' : 's'}`)
  }
  return parts.length ? parts.join(' + ') : 'Choose at least one question'
}

export function resolveModeDisplayCounts(
  modeId: QuizModeId,
  customCounts: QuestionCounts,
): QuestionCounts {
  if (modeId === 'custom') {
    try {
      return normalizeQuestionCounts(customCounts)
    } catch {
      return { mcq: Math.max(0, Math.floor(customCounts.mcq) || 0), shortEssay: Math.max(0, Math.floor(customCounts.shortEssay) || 0) }
    }
  }
  const preset = getQuizMode(modeId)
  return { mcq: preset.mcq, shortEssay: preset.shortEssay }
}

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
