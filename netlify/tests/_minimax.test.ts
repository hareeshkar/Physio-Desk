import { describe, expect, it, vi } from 'vitest'
import {
  assertMiniMaxSuccess,
  extractMiniMaxTextContent,
  extractMiniMaxToolArguments,
  extractMiniMaxToolArgumentsWithRepair,
  mapMiniMaxError,
  minimaxText,
  minimaxVlm,
} from '../functions/_minimax'

describe('MiniMax response handling', () => {
  it('unwraps successful base_resp responses', () => {
    expect(() => assertMiniMaxSuccess({ base_resp: { status_code: 0, status_msg: '' } })).not.toThrow()
  })

  it('maps rate limit and quota errors to friendly messages', () => {
    expect(() => assertMiniMaxSuccess({ base_resp: { status_code: 1002, status_msg: 'rate limit exceeded' } }))
      .toThrow(/MiniMax is busy/)
    expect(mapMiniMaxError(2056, 'quota exhausted').message).toMatch(/quota/)
  })

  it('extracts visible assistant text content', () => {
    const content = extractMiniMaxTextContent({
      choices: [{ message: { content: '{"ok":true}' } }],
      base_resp: { status_code: 0, status_msg: '' },
    })

    expect(content).toBe('{"ok":true}')
  })

  it('extracts structured tool-call arguments', () => {
    const args = extractMiniMaxToolArguments({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [{
            type: 'function',
            function: { name: 'submit_quiz', arguments: '{"resourceTitle":"Notes","questions":[]}' },
          }],
        },
      }],
      base_resp: { status_code: 0, status_msg: '' },
    }, 'submit_quiz')

    expect(args).toEqual({ resourceTitle: 'Notes', questions: [] })
  })

  it('repairs truncated tool-call JSON by asking MiniMax for the same tool arguments again', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              tool_calls: [{
                type: 'function',
                function: { name: 'submit_quiz', arguments: '{"resourceTitle":"Notes","questions":[' },
              }],
            },
          }],
          base_resp: { status_code: 0, status_msg: '' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              tool_calls: [{
                type: 'function',
                function: { name: 'submit_quiz', arguments: '{"resourceTitle":"Notes","questions":[]}' },
              }],
            },
          }],
          base_resp: { status_code: 0, status_msg: '' },
        }),
      })

    const args = await extractMiniMaxToolArgumentsWithRepair({
      response: await minimaxPostForTest(fetchImpl),
      toolName: 'submit_quiz',
      repair: () => minimaxPostForTest(fetchImpl),
    })

    expect(args).toEqual({ resourceTitle: 'Notes', questions: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns a friendly error when structured JSON is truncated twice', async () => {
    const response = {
      choices: [{
        message: {
          tool_calls: [{
            type: 'function',
            function: { name: 'submit_quiz', arguments: '{"resourceTitle":"Notes","questions":[' },
          }],
        },
      }],
      base_resp: { status_code: 0, status_msg: '' },
    }

    await expect(extractMiniMaxToolArgumentsWithRepair({
      response,
      toolName: 'submit_quiz',
      repair: async () => response,
    })).rejects.toThrow(/incomplete structured response twice/)
  })
})

async function minimaxPostForTest(fetchImpl: typeof fetch) {
  return (await import('../functions/_minimax')).minimaxPost('/v1/text/chatcompletion_v2', {}, 'sk-cp-test', fetchImpl)
}

describe('MiniMax API callers', () => {
  it('calls text generation with M2.7 defaults and tools', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{
              type: 'function',
              function: { name: 'submit_quiz', arguments: '{"ok":true}' },
            }],
          },
        }],
        base_resp: { status_code: 0, status_msg: '' },
      }),
    })

    const content = await minimaxText({
      apiKey: 'sk-cp-test',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'submit_quiz', parameters: { type: 'object' } } }],
      toolName: 'submit_quiz',
      fetchImpl,
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(content).toBe('{"ok":true}')
    expect(body.model).toBe('MiniMax-M2.7')
    expect(body.temperature).toBe(1)
    expect(body.max_tokens).toBeGreaterThanOrEqual(256)
    expect(body.tools[0].function.name).toBe('submit_quiz')
  })

  it('calls VLM with a base64 data URI image', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: 'visible page notes',
        base_resp: { status_code: 0, status_msg: '' },
      }),
    })

    const content = await minimaxVlm({
      apiKey: 'sk-cp-test',
      prompt: 'Describe',
      imageDataUri: 'data:image/png;base64,abc',
      fetchImpl,
    })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(content).toBe('visible page notes')
    expect(body.image_url).toBe('data:image/png;base64,abc')
  })
})
