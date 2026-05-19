import { getGeminiClient } from '../_gemini'

export interface DeleteStoreRequest {
  fileSearchStoreName: string
}

export async function handleDeleteStore(payload: DeleteStoreRequest) {
  const ai = getGeminiClient()

  await ai.fileSearchStores.delete({
    name: payload.fileSearchStoreName,
    config: { force: true },
  })

  return { deleted: true }
}
