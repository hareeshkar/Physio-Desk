const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

export class HttpError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  })
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text()
  if (!text.trim()) {
    throw new HttpError('Missing request body.', 400)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError('Invalid JSON request body.', 400)
  }
}

export function errorResponse(error: unknown, status = 500) {
  const message = formatErrorMessage(error)
  return jsonResponse({ error: message }, status)
}

export async function handlePost<T>(
  request: Request,
  handler: (payload: T) => Promise<unknown>,
) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const payload = await parseJsonBody<T>(request)
    const result = await handler(payload)
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }
    return errorResponse(error)
  }
}

function formatErrorMessage(error: unknown) {
  const details = extractErrorDetails(error)
  if (details.statusCode === 403 && details.message.toLowerCase().includes('denied access')) {
    return 'Gemini denied this API project access to the selected model. Check the API key/project permissions or use another enabled Gemini key.'
  }
  return error instanceof Error ? error.message : 'Unexpected error'
}

function extractErrorDetails(error: unknown) {
  const record = isRecord(error) ? error : {}
  const nested = isRecord(record.error) ? record.error : {}
  const statusCode = Number(record.status ?? record.code ?? nested.status ?? nested.code)
  const message = [
    record.message,
    nested.message,
    record.details,
    nested.details,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  return { statusCode, status: String(record.statusText ?? nested.status ?? record.code ?? '').toUpperCase(), message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
