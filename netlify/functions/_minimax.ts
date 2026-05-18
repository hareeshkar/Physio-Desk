type FetchLike = typeof fetch

export interface MiniMaxBaseResponse {
  base_resp?: {
    status_code?: number
    status_msg?: string
  }
}

export interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
}

export interface MiniMaxTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export class MiniMaxError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'MiniMaxError'
  }
}

export function getMiniMaxApiKey() {
  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not configured.')
  }

  return apiKey
}

export async function minimaxText(args: {
  apiKey?: string
  messages: MiniMaxMessage[]
  maxTokens?: number
  tools?: MiniMaxTool[]
  toolName?: string
  fetchImpl?: FetchLike
}) {
  const body: Record<string, unknown> = {
    model: 'MiniMax-M2.7',
    messages: args.messages,
    temperature: 1,
    max_tokens: Math.max(args.maxTokens ?? 2048, 256),
    stream: false,
  }

  if (args.tools?.length) {
    body.tools = args.tools
    body.tool_choice = 'auto'
  }

  const call = () => minimaxPost('/v1/text/chatcompletion_v2', body, args.apiKey, args.fetchImpl)
  const response = await call()

  if (!args.toolName) {
    return extractMiniMaxTextContent(response)
  }

  const toolArguments = await extractMiniMaxToolArgumentsWithRepair({
    response,
    toolName: args.toolName,
    repair: call,
  })

  return JSON.stringify(toolArguments)
}

export async function minimaxVlm(args: {
  apiKey?: string
  prompt: string
  imageDataUri: string
  fetchImpl?: FetchLike
}) {
  const response = await minimaxPost(
    '/v1/coding_plan/vlm',
    { prompt: args.prompt, image_url: args.imageDataUri },
    args.apiKey,
    args.fetchImpl,
  )
  const content = typeof response.content === 'string' ? response.content.trim() : ''
  if (!content) {
    throw new Error('MiniMax VLM returned empty content.')
  }

  return content
}

export async function minimaxPost(
  path: string,
  body: unknown,
  apiKey = getMiniMaxApiKey(),
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(`https://api.minimax.io${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const json = await response.json()

  if (!response.ok) {
    throw new Error(`MiniMax HTTP ${response.status}: ${JSON.stringify(json)}`)
  }

  assertMiniMaxSuccess(json)
  return json as Record<string, any>
}

export function assertMiniMaxSuccess(response: MiniMaxBaseResponse) {
  const code = response.base_resp?.status_code
  if (code === 0) return

  const fallbackMessage = response.base_resp?.status_msg || 'MiniMax request failed.'
  throw mapMiniMaxError(typeof code === 'number' ? code : -1, fallbackMessage)
}

export function mapMiniMaxError(statusCode: number, statusMessage: string) {
  const message = (() => {
    switch (statusCode) {
      case 1002:
        return 'MiniMax is busy right now. Please wait a moment and try again.'
      case 1004:
      case 2049:
        return 'MiniMax API key is invalid or not configured for this endpoint.'
      case 2056:
        return 'MiniMax quota is exhausted for this plan. Please wait for the quota window to reset.'
      case 1039:
        return 'MiniMax token limit was reached. Try a smaller note or shorter output.'
      case 1026:
        return 'MiniMax safety filter rejected this request. Please revise the note or prompt.'
      default:
        return `MiniMax error ${statusCode}: ${statusMessage}`
    }
  })()

  return new MiniMaxError(statusCode, message)
}

export function extractMiniMaxTextContent(response: Record<string, any>) {
  const content = response.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('MiniMax returned empty text content. Increase max_tokens or use tool-call output.')
  }

  return content.trim()
}

export function extractMiniMaxToolArguments(response: Record<string, any>, toolName: string) {
  const calls = response.choices?.[0]?.message?.tool_calls
  const call = Array.isArray(calls)
    ? calls.find((item) => item?.function?.name === toolName)
    : undefined
  const args = call?.function?.arguments

  if (typeof args !== 'string' || !args.trim()) {
    throw new Error(`MiniMax did not return ${toolName} tool arguments.`)
  }

  return JSON.parse(args) as unknown
}

export async function extractMiniMaxToolArgumentsWithRepair(args: {
  response: Record<string, any>
  toolName: string
  repair: () => Promise<Record<string, any>>
}) {
  try {
    return extractMiniMaxToolArguments(args.response, args.toolName)
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error
    }

    try {
      return extractMiniMaxToolArguments(await args.repair(), args.toolName)
    } catch (repairError) {
      if (repairError instanceof SyntaxError) {
        throw new Error('MiniMax returned an incomplete structured response twice. Please try again with fewer questions or retry in a moment.')
      }

      throw repairError
    }
  }
}
