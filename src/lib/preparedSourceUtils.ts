import type { PreparedSource, StudyResource } from './types'

export function preparedSourceFromResource(resource: StudyResource): PreparedSource | null {
  if (!resource.preparedSource?.fullText?.trim()) return null
  return resource.preparedSource
}

export function toPreparedSourcePayload(source: PreparedSource): PreparedSource {
  return {
    fileName: source.fileName,
    fullText: source.fullText,
  }
}

export function resourceNeedsPreparedSource(resource: StudyResource, file: File) {
  if (!resource.preparedSource?.fullText?.trim()) return true
  return resource.fileName !== file.name || resource.size !== file.size
}

export function mergePreparedSourceFromResponse(
  resource: StudyResource,
  responseSource?: PreparedSource,
): StudyResource {
  if (!responseSource?.fullText?.trim()) return resource

  return {
    ...resource,
    preparedSource: {
      fileName: responseSource.fileName || resource.fileName,
      fullText: resource.preparedSource?.fullText?.length
        && resource.preparedSource.fullText.length >= responseSource.fullText.length
        ? resource.preparedSource.fullText
        : responseSource.fullText,
    },
    preparedSourceExtractedAt: resource.preparedSourceExtractedAt ?? new Date().toISOString(),
  }
}
