import { describe, expect, it } from 'vitest'
import {
  buildVerifySourceText,
  collectReferencedPageNumbers,
} from './verifySourceSlice'
import { detectPageExtractionQuality, type SourcePageRecord } from './sourceCoverage'

function page(pageNumber: number, text: string): SourcePageRecord {
  return { pageNumber, text, extractionQuality: detectPageExtractionQuality(text) }
}

describe('verifySourceSlice', () => {
  it('collects cited pages with padding', () => {
    expect(collectReferencedPageNumbers([{ pageNumber: 5 }], 1)).toEqual(new Set([4, 5, 6]))
  })

  it('scopes verify text to referenced pages only', () => {
    const pages = [
      page(1, 'alpha content'),
      page(2, 'beta content'),
      page(3, 'gamma content'),
    ]

    const text = buildVerifySourceText({
      pages,
      fullText: 'full',
      questions: [{ pageNumber: 2 }],
      pagePadding: 0,
    })

    expect(text).toContain('SOURCE_PAGE 2')
    expect(text).toContain('beta content')
    expect(text).not.toContain('SOURCE_PAGE 1')
    expect(text).not.toContain('gamma content')
  })

  it('falls back to full text when no page numbers are cited', () => {
    const pages = [page(1, 'only page')]
    const text = buildVerifySourceText({
      pages,
      fullText: 'FALLBACK_FULL',
      questions: [{ pageNumber: undefined }],
    })

    expect(text).toContain('only page')
  })

  it('truncates very large scoped text', () => {
    const pages = [page(1, 'x'.repeat(60_000))]
    const text = buildVerifySourceText({
      pages,
      fullText: 'full',
      questions: [{ pageNumber: 1 }],
      maxChars: 1000,
    })

    expect(text.endsWith('[VERIFY_SOURCE_TRUNCATED]')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(1000 + '\n[VERIFY_SOURCE_TRUNCATED]'.length)
    expect(text).toContain('[VERIFY_SOURCE_TRUNCATED]')
  })
})
