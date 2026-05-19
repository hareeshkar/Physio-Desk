function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Smaller verify payloads — drops explanations and duplicate fields. */
export function compactQuestionsForVerify(questions: unknown[]) {
  if (!Array.isArray(questions)) return []

  return questions.map((question) => {
    if (!isRecord(question)) return question

    const compact: Record<string, unknown> = {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      expectedAnswer: question.expectedAnswer,
      evidenceQuote: question.evidenceQuote,
      pageNumber: question.pageNumber,
    }

    if (question.type === 'mcq') {
      compact.correctChoiceId = question.correctChoiceId
      compact.choices = question.choices
    } else if (question.type === 'short_essay') {
      compact.keyPoints = question.keyPoints
    }

    return compact
  })
}
