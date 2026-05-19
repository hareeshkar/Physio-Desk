import { extractPdfTextFromFile } from './pdfExtract'
import {
  mergePreparedSourceFromResponse,
  preparedSourceFromResource,
  resourceNeedsPreparedSource,
  toPreparedSourcePayload,
} from './preparedSourceUtils'
import type { PreparedSource, StudyResource } from './types'

export {
  mergePreparedSourceFromResponse,
  preparedSourceFromResource,
  resourceNeedsPreparedSource,
  toPreparedSourcePayload,
}

export async function ensurePreparedSourceForFile(
  file: File,
  resource: StudyResource,
): Promise<{ preparedSource: PreparedSource; resource: StudyResource }> {
  if (!resourceNeedsPreparedSource(resource, file)) {
    return { preparedSource: resource.preparedSource!, resource }
  }

  const preparedSource = await extractPdfTextFromFile(file)
  return {
    preparedSource,
    resource: {
      ...resource,
      preparedSource,
      preparedSourceExtractedAt: new Date().toISOString(),
    },
  }
}

export async function ensurePreparedSourceForResource(
  resource: StudyResource,
): Promise<PreparedSource> {
  const cached = preparedSourceFromResource(resource)
  if (cached) return cached

  const file = new File([resource.fileBlob], resource.fileName, {
    type: resource.mimeType || 'application/pdf',
  })
  return extractPdfTextFromFile(file)
}
