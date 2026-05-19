import { describe, expect, it } from 'vitest'
import { handleEvaluateAnswer } from '../routes/evaluate-answer'

const question = {
  type: 'short_essay' as const,
  prompt: 'Explain portal hypertension.',
  expectedAnswer: 'Portal hypertension increases pressure in the portal venous system.',
  keyPoints: ['Increased portal pressure'],
  evidenceQuote: 'Portal hypertension causes varices.',
}

describe('evaluate-answer handler', () => {
  it('short-circuits skipped essays without requiring a PDF source', async () => {
    const body = await handleEvaluateAnswer({
      question,
      skipped: true,
    })

    expect(body).toEqual({
      score: 0,
      skipped: true,
      feedback: 'Skipped for later.',
      sourceReminder: 'Portal hypertension causes varices.',
      missingKeyPoints: ['Increased portal pressure'],
    })
  })
})
