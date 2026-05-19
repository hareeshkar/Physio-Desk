import { describe, expect, it } from 'vitest'
import { mergePreparedSourceFromResponse, resourceNeedsPreparedSource } from './preparedSourceUtils'
import type { StudyResource } from './types'

const baseResource: StudyResource = {
  id: 'r1',
  title: 'Note',
  fileName: 'note.pdf',
  mimeType: 'application/pdf',
  size: 100,
  createdAt: '2026-01-01T00:00:00.000Z',
  fileBlob: new Blob(['pdf']),
  indexStatus: 'ready',
}

describe('preparedSource helpers', () => {
  it('detects when a new file needs extraction', () => {
    expect(resourceNeedsPreparedSource(baseResource, new File(['pdf'], 'note.pdf'))).toBe(true)
    const file = new File(['pdf'], 'note.pdf', { type: 'application/pdf' })
    expect(resourceNeedsPreparedSource({
      ...baseResource,
      size: file.size,
      preparedSource: { fileName: 'note.pdf', fullText: 'cached text' },
    }, file)).toBe(false)
  })

  it('keeps the longer cached source text when merging server responses', () => {
    const merged = mergePreparedSourceFromResponse({
      ...baseResource,
      preparedSource: { fileName: 'note.pdf', fullText: 'a'.repeat(100) },
    }, { fileName: 'note.pdf', fullText: 'short' })

    expect(merged.preparedSource?.fullText).toHaveLength(100)
  })
})
