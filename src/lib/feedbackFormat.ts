import type { AnswerAttempt, EvaluationResult, Question } from './types'

type FeedbackInput = EvaluationResult | Pick<AnswerAttempt, 'feedback' | 'isCorrect' | 'skipped' | 'evaluationStatus' | 'evaluationError' | 'userAnswer'>

export interface FeedbackSections {
  resultLabel: 'Correct' | 'Wrong' | 'Skipped' | 'Answer from your note' | 'Checking' | 'Needs retry'
  resultHint: string
  yourAnswer?: string
  correctAnswer?: string
  whyLabel: string
  why: string
}

export function buildFeedbackSections(feedback: FeedbackInput, question?: Question): FeedbackSections {
  const sections = parseFeedbackSections(feedback.feedback)
  const legacy = parseLegacyFeedback(feedback.feedback)
  const correctAnswer = sections.CORRECT_ANSWER ?? legacy.correctAnswer ?? formatQuestionCorrectAnswer(question)
  const resultLabel = getResultLabel(feedback, sections)
  const savedAnswer = 'userAnswer' in feedback ? feedback.userAnswer : undefined
  const yourAnswer = firstNonEmpty(savedAnswer, sections.YOUR_ANSWER, legacy.yourAnswer)
  const why = getWhyText({
    feedback,
    question,
    resultLabel,
    whyFromModel: firstNonEmpty(sections.WHY, legacy.why),
    yourAnswer,
    correctAnswer,
  })

  return {
    resultLabel,
    resultHint: getResultHint(resultLabel),
    yourAnswer,
    correctAnswer,
    whyLabel: getWhyLabel(resultLabel, question),
    why,
  }
}

export function parseFeedbackSections(value: string) {
  return value
    .split(/\n+/)
    .reduce<Record<string, string>>((sections, part) => {
      const match = part.match(/^([A-Z_]+):\s*([\s\S]*)$/)
      if (!match) return sections
      sections[match[1]] = match[2].trim()
      return sections
    }, {})
}

function parseLegacyFeedback(value: string) {
  const wrong = value.match(/Why it is wrong:\s*([\s\S]*?)(?=Why the correct answer is correct:|$)/i)?.[1]?.trim()
  const correct = value.match(/Why the correct answer is correct:\s*([\s\S]*)$/i)?.[1]?.trim()
  const selected = wrong?.match(/You selected\s+([^,]+),/i)?.[1]?.trim()
  const answer = wrong?.match(/note-backed answer is\s+([\s\S]*?)(?:\.?\s*$)/i)?.[1]?.trim().replace(/\.$/, '')

  return {
    yourAnswer: selected,
    correctAnswer: answer,
    why: [wrong, correct].filter(Boolean).join('\n\n'),
  }
}

function formatQuestionCorrectAnswer(question?: Question) {
  if (!question) return undefined
  if (question.type !== 'mcq') return question.expectedAnswer

  const choice = question.choices?.find((item) => item.id === question.correctChoiceId)
  return question.correctChoiceId
    ? `${question.correctChoiceId}. ${choice?.text ?? question.expectedAnswer}`
    : question.expectedAnswer
}

function getResultLabel(
  feedback: FeedbackInput,
  sections: Record<string, string>,
): FeedbackSections['resultLabel'] {
  const evaluationStatus = getEvaluationStatus(feedback)
  if (evaluationStatus === 'pending') return 'Checking'
  if (evaluationStatus === 'failed') return 'Needs retry'
  if (feedback.skipped) return 'Skipped'
  if (feedback.isCorrect === true) return 'Correct'
  if (feedback.isCorrect === false) return 'Wrong'
  if (sections.RESULT?.toLowerCase() === 'correct') return 'Correct'
  if (sections.RESULT?.toLowerCase() === 'wrong') return 'Wrong'
  return 'Answer from your note'
}

function getEvaluationStatus(feedback: FeedbackInput) {
  return 'evaluationStatus' in feedback ? feedback.evaluationStatus : undefined
}

function getEvaluationError(feedback: FeedbackInput) {
  return 'evaluationError' in feedback ? feedback.evaluationError : undefined
}

function getWhyLabel(result: FeedbackSections['resultLabel'], question?: Question) {
  if (question?.type === 'short_essay' || !question) {
    if (result === 'Correct') return 'How can you improve that answer?'
    if (result === 'Wrong') return "Why it's wrong"
  }

  return 'Why'
}

function getWhyText({
  feedback,
  question,
  resultLabel,
  whyFromModel,
  yourAnswer,
  correctAnswer,
}: {
  feedback: FeedbackInput
  question?: Question
  resultLabel: FeedbackSections['resultLabel']
  whyFromModel?: string
  yourAnswer?: string
  correctAnswer?: string
}) {
  if (getEvaluationStatus(feedback) === 'failed') {
    return getEvaluationError(feedback) ?? feedback.feedback
  }

  if (whyFromModel) return whyFromModel

  if (resultLabel === 'Wrong') {
    const missing = question?.keyPoints?.length
      ? ` Key points to include: ${question.keyPoints.join('; ')}.`
      : ''
    return `Your answer${yourAnswer ? ` (${yourAnswer})` : ''} does not include the note-backed answer${correctAnswer ? `: ${correctAnswer}` : ''}.${missing}`
  }

  if (resultLabel === 'Correct') {
    const improvement = question?.keyPoints?.length
      ? ` To improve it, make the source terms explicit: ${question.keyPoints.join('; ')}.`
      : ' To improve it, add more source-specific terminology and detail.'
    return `Your answer matches the main meaning.${improvement}`
  }

  return firstNonEmpty(feedback.feedback) ?? 'Review this answer against the source quote.'
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim()
}

function getResultHint(result: FeedbackSections['resultLabel']) {
  if (result === 'Correct') return 'Nice, that matches the note.'
  if (result === 'Wrong') return 'Review the correct answer below.'
  if (result === 'Skipped') return 'Marked for revision.'
  if (result === 'Checking') return 'Your answer is saved. Review will update shortly.'
  if (result === 'Needs retry') return 'Your answer is saved, but checking failed.'
  return 'Compare your answer with the note.'
}
