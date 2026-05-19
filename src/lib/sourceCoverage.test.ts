import { describe, expect, it } from 'vitest'
import {
  buildExtractionWarnings,
  buildModelTextFromPages,
  detectPageExtractionQuality,
  planPageChunks,
  selectPagesForModel,
  type SourcePageRecord,
} from './sourceCoverage'

function page(pageNumber: number, text: string): SourcePageRecord {
  return {
    pageNumber,
    text,
    extractionQuality: detectPageExtractionQuality(text),
  }
}

describe('sourceCoverage', () => {
  it('plans chunks by character budget without dropping pages', () => {
    const pages = Array.from({ length: 5 }, (_, index) => page(index + 1, 'x'.repeat(8_000)))
    const chunks = planPageChunks(pages, 10_000)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flatMap((chunk) => chunk.pageNumbers)).toEqual([1, 2, 3, 4, 5])
  })

  it('selects only requested pages for model calls', () => {
    const pages = [page(1, 'one'), page(2, 'two'), page(3, 'three')]
    const selected = selectPagesForModel(pages, [2, 3])

    expect(selected.map((item) => item.pageNumber)).toEqual([2, 3])
    expect(buildModelTextFromPages(selected)).toContain('SOURCE_PAGE 2')
    expect(buildModelTextFromPages(selected)).not.toContain('SOURCE_PAGE 1')
  })

  it('warns when many pages are weak', () => {
    const warnings = buildExtractionWarnings({
      pageCount: 10,
      weakPageCount: 7,
      strongPageCount: 3,
      visualPageCount: 0,
    })

    expect(warnings[0]).toContain('7 of 10')
  })
})
