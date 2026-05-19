import type { PreparedSource, StudyResource } from './types'

export function preparedSourceFromResource(resource: StudyResource): PreparedSource | null {
  if (!resource.preparedSource?.fullText?.trim()) return null
  return resource.preparedSource
}

export function toPreparedSourcePayload(source: PreparedSource): PreparedSource {
  return {
    fileName: source.fileName,
    fullText: source.fullText,
    pages: source.pages,
    stats: source.stats,
    warnings: source.warnings,
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

  const keepLocal = resource.preparedSource?.fullText?.length
    && resource.preparedSource.fullText.length >= (responseSource.fullText?.length ?? 0)

  return {
    ...resource,
    preparedSource: keepLocal
      ? resource.preparedSource
      : {
          ...responseSource,
          pages: responseSource.pages ?? resource.preparedSource?.pages,
          stats: responseSource.stats ?? resource.preparedSource?.stats,
          warnings: responseSource.warnings ?? resource.preparedSource?.warnings,
        },
    preparedSourceExtractedAt: resource.preparedSourceExtractedAt ?? new Date().toISOString(),
  }
}
