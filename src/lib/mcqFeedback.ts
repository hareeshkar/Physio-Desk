import type { ChoiceId, EvaluationResult, Question } from './types'

export function buildLocalMcqFeedback(
  question: Question,
  selectedChoiceId: string | undefined,
  options: { skipped?: boolean } = {},
): EvaluationResult {
  const selectedChoice = question.choices?.find((choice) => choice.id === selectedChoiceId)
  const correctChoice = question.choices?.find((choice) => choice.id === question.correctChoiceId)
  const isCorrect = Boolean(!options.skipped && selectedChoiceId && selectedChoiceId === question.correctChoiceId)
  const correctAnswer = correctChoice
    ? `${correctChoice.id}. ${correctChoice.text}`
    : question.expectedAnswer
  const selectedAnswer = selectedChoice
    ? `${selectedChoice.id}. ${selectedChoice.text}`
    : selectedChoiceId || 'No option selected'
  const wrongWhy = selectedChoice
    ? `${selectedChoice.text} is not the note-backed answer here.`
    : 'No option was selected.'

  return {
    isCorrect,
    score: isCorrect ? 5 : 0,
    skipped: options.skipped,
    feedback: options.skipped
      ? [
          'RESULT: skipped',
          'YOUR_ANSWER: Skipped',
          `CORRECT_ANSWER: ${correctAnswer}`,
          `WHY: You skipped this question, so it is marked for revision. ${question.explanation}`,
        ].join('\n\n')
      : isCorrect
      ? [
          'RESULT: correct',
          `YOUR_ANSWER: ${correctAnswer}`,
          `CORRECT_ANSWER: ${correctAnswer}`,
          `WHY: You selected the note-backed answer. ${question.explanation}`,
        ].join('\n\n')
      : [
          'RESULT: wrong',
          `YOUR_ANSWER: ${selectedAnswer}`,
          `CORRECT_ANSWER: ${correctAnswer}`,
          `WHY: ${wrongWhy} The correct answer is correct because: ${question.explanation}`,
        ].join('\n\n'),
    sourceReminder: question.evidenceQuote,
    missingKeyPoints: isCorrect ? [] : question.keyPoints,
  }
}

export function toChoiceId(value: string | undefined): ChoiceId | undefined {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E'
    ? value
    : undefined
}
