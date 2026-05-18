import { describe, expect, it } from 'vitest'
import { buildLocalMcqFeedback } from './mcqFeedback'
import type { Question } from './types'

const question: Question = {
  id: 'q1',
  sessionId: 's1',
  resourceId: 'r1',
  type: 'mcq',
  topic: 'Esophageal pathology',
  prompt: 'What causes esophageal varices?',
  choices: [
    { id: 'A', text: 'Acute gastritis' },
    { id: 'B', text: 'Portal hypertension' },
    { id: 'C', text: 'Barrett esophagus' },
    { id: 'D', text: 'Gastric carcinoma' },
  ],
  correctChoiceId: 'B',
  expectedAnswer: 'Portal hypertension',
  keyPoints: ['Portal hypertension', 'Collateral bypass channels'],
  explanation: 'Portal hypertension diverts blood through esophageal collateral channels.',
  evidenceQuote: 'Portal hypertension ... collateral bypass channels ... esophageal plexus.',
  groundingConfidence: 'strong',
  verificationStatus: 'accepted',
}

describe('buildLocalMcqFeedback', () => {
  it('marks a correct selected option without needing an AI call', () => {
    const feedback = buildLocalMcqFeedback(question, 'B')

    expect(feedback.isCorrect).toBe(true)
    expect(feedback.score).toBe(5)
    expect(feedback.feedback).toContain('RESULT: correct')
    expect(feedback.feedback).toContain('WHY: You selected the note-backed answer.')
    expect(feedback.feedback).toContain('Portal hypertension')
    expect(feedback.sourceReminder).toBe(question.evidenceQuote)
  })

  it('explains why a wrong selected option is wrong and why the correct answer is correct', () => {
    const feedback = buildLocalMcqFeedback(question, 'A')

    expect(feedback.isCorrect).toBe(false)
    expect(feedback.score).toBe(0)
    expect(feedback.feedback).toContain('RESULT: wrong')
    expect(feedback.feedback).toContain('YOUR_ANSWER: A. Acute gastritis')
    expect(feedback.feedback).toContain('CORRECT_ANSWER: B. Portal hypertension')
    expect(feedback.feedback).toContain('WHY: Acute gastritis is not the note-backed answer here.')
    expect(feedback.feedback).toContain('A. Acute gastritis')
    expect(feedback.feedback).toContain('B. Portal hypertension')
  })

  it('marks skipped MCQs explicitly', () => {
    const feedback = buildLocalMcqFeedback(question, undefined, { skipped: true })

    expect(feedback.skipped).toBe(true)
    expect(feedback.isCorrect).toBe(false)
    expect(feedback.score).toBe(0)
    expect(feedback.feedback).toContain('RESULT: skipped')
    expect(feedback.feedback).toContain('You skipped this question')
    expect(feedback.feedback).toContain('B. Portal hypertension')
  })
})
