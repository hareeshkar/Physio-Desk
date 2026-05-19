import { describe, expect, it } from 'vitest'
import { buildPreparedSourceText, normalizeExtractedText } from './pdfTextFormat'

describe('pdfExtract helpers', () => {
  it('normalizes whitespace in extracted text', () => {
    expect(normalizeExtractedText('line one\r\n\r\n\r\nline   two')).toBe('line one\n\nline two')
  })

  it('builds page-oriented source text for the model', () => {
    expect(buildPreparedSourceText([
      { pageNumber: 1, text: 'Portal hypertension' },
      { pageNumber: 2, text: '' },
    ])).toBe('SOURCE_PAGE 1\nTEXT: Portal hypertension\n\nSOURCE_PAGE 2')
  })
})
