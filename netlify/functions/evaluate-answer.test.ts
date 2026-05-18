import { describe, expect, it } from 'vitest'
import { handler } from './evaluate-answer'

const question = {
  type: 'short_essay',
  prompt: 'Explain portal hypertension.',
  expectedAnswer: 'Portal hypertension increases pressure in the portal venous system.',
  keyPoints: ['Increased portal pressure'],
  evidenceQuote: 'Portal hypertension causes varices.',
}

describe('evaluate-answer function', () => {
  it('short-circuits skipped essays without requiring a PDF source', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        pdfSource: undefined,
        question,
        skipped: true,
      }),
    } as never, {} as never, undefined as never)

    const body = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(body).toEqual({
      score: 0,
      skipped: true,
      feedback: 'Skipped for later.',
      sourceReminder: 'Portal hypertension causes varices.',
      missingKeyPoints: ['Increased portal pressure'],
    })
  })
})
