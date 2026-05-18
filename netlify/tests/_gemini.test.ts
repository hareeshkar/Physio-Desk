import { describe, expect, it, vi } from 'vitest'
import {
  buildDirectPdfContents,
  FALLBACK_MODEL_IDS,
  generateContentWithFallback,
  generateContentWithPdfFallback,
  isGeminiHighDemandUnavailableError,
  MODEL_ID,
  normalizeEvaluationResponse,
  normalizeQuizResponse,
  normalizeVerificationResponse,
  parseGeminiJson,
  requirePdfSource,
} from '../functions/_gemini'

describe('generateContentWithFallback', () => {
  it('falls back to Gemini 3 Flash-Lite on high-demand 503 errors', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('The model is overloaded due to high demand.'), {
          code: 'UNAVAILABLE',
          status: 503,
        }),
      )
      .mockResolvedValueOnce({ text: '{"ok":true}' })
    const ai = { models: { generateContent } }
    const params = {
      model: MODEL_ID,
      contents: 'Create a quiz.',
      config: {
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }

    const response = await generateContentWithFallback(ai, params)

    expect(response.text).toBe('{"ok":true}')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent).toHaveBeenNthCalledWith(1, params)
    expect(generateContent).toHaveBeenNthCalledWith(2, {
      ...params,
      model: FALLBACK_MODEL_IDS[0],
    })
  })

  it('falls back on per-model quota exhaustion', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce({
        status: 429,
        error: {
          status: 'RESOURCE_EXHAUSTED',
          message: 'Quota exceeded for metric generate_content_free_tier_requests, model: gemini-3-flash',
        },
      })
      .mockResolvedValueOnce({ text: '{"ok":true}' })
    const ai = { models: { generateContent } }
    const params = {
      model: MODEL_ID,
      contents: 'Create a quiz.',
    }

    const response = await generateContentWithFallback(ai, params)

    expect(response.text).toBe('{"ok":true}')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent).toHaveBeenNthCalledWith(2, {
      ...params,
      model: FALLBACK_MODEL_IDS[0],
    })
  })

  it('falls back when the SDK serializes quota details into the error message', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            '{"error":{"code":429,"message":"Quota exceeded for metric generate_content_free_tier_requests, model: gemini-3-flash","status":"RESOURCE_EXHAUSTED"}}',
          ),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce({ text: '{"ok":true}' })
    const ai = { models: { generateContent } }
    const params = {
      model: MODEL_ID,
      contents: 'Create a quiz.',
    }

    const response = await generateContentWithFallback(ai, params)

    expect(response.text).toBe('{"ok":true}')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent).toHaveBeenNthCalledWith(2, {
      ...params,
      model: FALLBACK_MODEL_IDS[0],
    })
  })

  it('does not fall back for non-availability errors', async () => {
    const error = Object.assign(new Error('Invalid request'), { status: 400 })
    const generateContent = vi.fn().mockRejectedValueOnce(error)
    const ai = { models: { generateContent } }

    await expect(
      generateContentWithFallback(ai, {
        model: MODEL_ID,
        contents: 'Create a quiz.',
      }),
    ).rejects.toBe(error)
    expect(generateContent).toHaveBeenCalledTimes(1)
  })
})

describe('isGeminiHighDemandUnavailableError', () => {
  it('recognizes Gemini overloaded unavailable responses', () => {
    expect(
      isGeminiHighDemandUnavailableError({
        error: {
          code: 503,
          status: 'UNAVAILABLE',
          message: 'The model is overloaded. Please try again later.',
        },
      }),
    ).toBe(true)
  })

  it('keeps fallback models on Gemini 3 Flash-Lite', () => {
    expect(FALLBACK_MODEL_IDS).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
    ])
  })
})

describe('parseGeminiJson', () => {
  it('repairs markdown-fenced JSON with trailing commas', () => {
    const parsed = parseGeminiJson<{ results: Array<{ questionId: string; verdict: string }> }>(
      [
        '```json',
        '{',
        '  "results": [',
        '    {',
        '      "questionId": "q1",',
        '      "verdict": "accepted",',
        '    },',
        '  ],',
        '}',
        '```',
      ].join('\n'),
      '{"results":[]}',
      'verify-quiz',
    )

    expect(parsed.results).toEqual([{ questionId: 'q1', verdict: 'accepted' }])
  })

  it('reports sanitized context when Gemini JSON cannot be repaired', () => {
    expect(() => parseGeminiJson('{ "results": [', '{"results":[]}', 'verify-quiz')).toThrow(
      /Invalid JSON from Gemini in verify-quiz/,
    )
  })
})

describe('Gemini response normalization', () => {
  it('normalizes a partial quiz response without exposing undefined arrays', () => {
    const result = normalizeQuizResponse(
      {
        resourceTitle: 'Gait notes',
        questions: [
          {
            type: 'mcq',
            topic: 'Gait',
            prompt: 'What phase is described?',
            choices: undefined,
            keyPoints: undefined,
            expectedAnswer: 'Stance',
            explanation: 'From the source',
            evidenceQuote: 'The source says stance phase.',
            groundingConfidence: 'strong',
          },
        ],
      },
      'generate-quiz',
    )

    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].choices).toEqual([])
    expect(result.questions[0].keyPoints).toEqual([])
    expect(result.warnings).toContain('generate-quiz: question 1 choices was not an array.')
    expect(result.warnings).toContain('generate-quiz: question 1 keyPoints was not an array.')
  })

  it('returns a stable empty quiz response when Gemini omits questions', () => {
    const result = normalizeQuizResponse({ resourceTitle: 'Bad response' }, 'generate-quiz')

    expect(result).toMatchObject({
      resourceTitle: 'Bad response',
      questions: [],
      warnings: ['generate-quiz: questions was not an array.'],
    })
  })

  it('normalizes verification results and rejects malformed result arrays', () => {
    const result = normalizeVerificationResponse({ results: undefined }, 'verify-quiz')

    expect(result.results).toEqual([])
    expect(result.warnings).toEqual(['verify-quiz: results was not an array.'])
  })

  it('normalizes evaluation responses with missingKeyPoints as an array', () => {
    const result = normalizeEvaluationResponse(
      {
        score: 2,
        feedback: 'Good',
        sourceReminder: 'Source quote',
        missingKeyPoints: undefined,
      },
      'evaluate-answer',
    )

    expect(result).toEqual({
      isCorrect: false,
      score: 2,
      feedback: 'Good',
      sourceReminder: 'Source quote',
      missingKeyPoints: [],
      warnings: ['evaluate-answer: missingKeyPoints was not an array.'],
    })
  })
})

describe('direct PDF request helpers', () => {
  it('requires an application/pdf source with base64 data', () => {
    const source = requirePdfSource({
      fileName: 'gastro.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0x',
    })

    expect(source).toEqual({
      fileName: 'gastro.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0x',
    })
  })

  it('rejects non-PDF direct sources', () => {
    expect(() => requirePdfSource({
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      base64: 'abc',
    })).toThrow(/Only PDF direct document input is supported/)
  })

  it('builds Gemini contents with instructions and inline PDF data', () => {
    const contents = buildDirectPdfContents('Create a quiz.', {
      fileName: 'gastro.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0x',
    })

    expect(contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'Create a quiz.' },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: 'JVBERi0x',
            },
          },
        ],
      },
    ])
  })

  it('falls back to extracted PDF text when direct PDF access is denied', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('{"error":{"code":403,"message":"Your project has been denied access. Please contact support.","status":"PERMISSION_DENIED"}}'))
      .mockResolvedValueOnce({ text: '{"ok":true}' })
    const ai = { models: { generateContent } }

    const response = await generateContentWithPdfFallback(
      ai,
      { model: MODEL_ID },
      'Create a quiz.',
      {
        fileName: 'fake.pdf',
        mimeType: 'application/pdf',
        base64: 'bm90LWEtcmVhbC1wZGY=',
      },
      async (instructions, source) => `${instructions}\n\nAttached PDF source text extracted from ${source.fileName}:\n\nFake source text.`,
    )

    expect(response.text).toBe('{"ok":true}')
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent.mock.calls[1][0].contents).toContain('Attached PDF source text extracted from fake.pdf')
  })
})
