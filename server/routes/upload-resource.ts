import {
  EMBEDDING_MODEL_ID,
  getGeminiClient,
} from '../_gemini'
import { HttpError } from '../http'

export interface UploadResourceRequest {
  fileName: string
  mimeType: string
  base64: string
}

const supportedMimePrefixes = ['text/']
const supportedMimeTypes = new Set([
  'application/pdf',
  'application/json',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function handleUploadResource(payload: UploadResourceRequest) {
  if (!isSupportedMime(payload.mimeType)) {
    throw new HttpError('Unsupported file type for this study app.', 400)
  }

  let createdStoreName: string | undefined

  try {
    const ai = getGeminiClient()
    const fileSearchStore = await ai.fileSearchStores.create({
      config: {
        displayName: `study-${Date.now()}-${slugify(payload.fileName)}`,
        embeddingModel: EMBEDDING_MODEL_ID,
      },
    })
    createdStoreName = fileSearchStore.name

    let operation = await ai.fileSearchStores.uploadToFileSearchStore({
      fileSearchStoreName: fileSearchStore.name!,
      file: new Blob([Buffer.from(payload.base64, 'base64')], { type: payload.mimeType }),
      config: {
        displayName: payload.fileName,
        mimeType: payload.mimeType,
      },
    })

    for (let attempt = 0; attempt < 48 && !operation.done; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      operation = await ai.operations.get({ operation })
    }

    if (!operation.done) {
      throw new Error('File indexing did not complete before timeout. Please try again in a minute.')
    }

    if (operation.error) {
      throw new Error(operation.error?.message ?? 'File indexing did not complete.')
    }

    const documentName = operation.response?.documentName
    if (!documentName) {
      throw new Error('File uploaded, but Gemini did not return a document name.')
    }

    return {
      fileSearchStoreName: fileSearchStore.name,
      documentName,
      mimeType: payload.mimeType,
      displayName: payload.fileName,
    }
  } catch (error) {
    if (createdStoreName) {
      try {
        const ai = getGeminiClient()
        await ai.fileSearchStores.delete({ name: createdStoreName, config: { force: true } })
      } catch {
        // Best-effort cleanup only.
      }
    }
    throw error
  }
}

function isSupportedMime(mimeType: string) {
  return supportedMimeTypes.has(mimeType) || supportedMimePrefixes.some((prefix) => mimeType.startsWith(prefix))
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}
