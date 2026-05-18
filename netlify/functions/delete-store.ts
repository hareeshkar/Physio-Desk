import type { Handler } from '@netlify/functions'
import { getGeminiClient, jsonResponse, parseJsonBody, safeError } from './_gemini'

interface DeleteStoreRequest {
  fileSearchStoreName: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse({})
  if (event.httpMethod !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const payload = parseJsonBody<DeleteStoreRequest>(event.body)
    const ai = getGeminiClient()

    await ai.fileSearchStores.delete({
      name: payload.fileSearchStoreName,
      config: { force: true },
    })

    return jsonResponse({ deleted: true })
  } catch (error) {
    return safeError(error)
  }
}
