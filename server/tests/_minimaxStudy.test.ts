import { describe, expect, it } from 'vitest'
import { buildEvaluationPrompt, buildQuizPrompt, buildVerifyPrompt } from '../_minimaxStudy'
import type { PreparedSourceDocument } from '../_document'

const source: PreparedSourceDocument = {
  fileName: 'note.pdf',
  mimeType: 'application/pdf',
  pages: [{ pageNumber: 1, text: 'Portal hypertension causes varices.', extractionQuality: 'strong' }],
  fullText: 'SOURCE_PAGE 1\nTEXT: Portal hypertension causes varices.',
  visualNotes: [],
  warnings: [],
}

describe('buildQuizPrompt', () => {
  it('does not request MCQ candidates when MCQ count is zero', () => {
    const prompt = buildQuizPrompt({
      source,
      requestedMcq: 0,
      requestedShort: 3,
      choiceCount: 4,
      previousQuestions: [],
    })

    expect(prompt).toContain('Generate 0 MCQ candidates and 4 short essay candidates.')
  })

  it('does not request short essay candidates when short essay count is zero', () => {
    const prompt = buildQuizPrompt({
      source,
      requestedMcq: 5,
      requestedShort: 0,
      choiceCount: 4,
      previousQuestions: [],
    })

    expect(prompt).toContain('Generate 7 MCQ candidates and 0 short essay candidates.')
  })
})

describe('buildVerifyPrompt', () => {
  it('asks for immediate tool output and scopes source text', () => {
    const prompt = buildVerifyPrompt({
      source: {
        ...source,
        pages: [
          { pageNumber: 1, text: 'one', extractionQuality: 'strong' },
          { pageNumber: 2, text: 'two', extractionQuality: 'strong' },
          { pageNumber: 3, text: 'three', extractionQuality: 'strong' },
        ],
        fullText:
          'SOURCE_PAGE 1\nTEXT: one\n\nSOURCE_PAGE 2\nTEXT: two\n\nSOURCE_PAGE 3\nTEXT: three',
      },
      questions: [{ id: 'q1', pageNumber: 3 }],
    })

    expect(prompt).toContain('submit_verification immediately')
    expect(prompt).toContain('TEXT: three')
    expect(prompt).not.toContain('TEXT: one')
  })
})

describe('buildEvaluationPrompt', () => {
  it('grades meaning strictly without requiring exact copy-paste wording', () => {
    const prompt = buildEvaluationPrompt({
      source,
      question: {
        prompt: 'Explain portal hypertension.',
        expectedAnswer: 'Portal hypertension increases pressure in the portal venous system.',
        keyPoints: ['Increased portal pressure'],
        evidenceQuote: 'Portal hypertension causes varices.',
      },
      userAnswer: 'Pressure goes up in the portal veins.',
    })

    expect(prompt).toContain('Do not require exact wording')
    expect(prompt).toContain('Credit synonyms, paraphrases, reordered explanations, and concise answers')
    expect(prompt).toContain('isCorrect must be true only when score is 4 or 5')
    expect(prompt).toContain('Missing key points must come only from the provided keyPoints list')
    expect(prompt).toContain('For correct answers, WHY must explain how the student can improve')
    expect(prompt).toContain('For wrong answers, WHY must explain why the answer is wrong')
    expect(prompt).toContain('Never leave WHY empty')
    expect(prompt).toContain('If the answer is nonsense or unrelated')
  })
})
