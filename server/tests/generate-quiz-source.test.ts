import { describe, expect, it } from 'vitest'
import { preparedSourceToDocument, requirePreparedSource } from '../_document'

describe('generate-quiz source input', () => {
  it('accepts prepared source without a PDF payload', async () => {
    const payload = requirePreparedSource({
      fileName: 'note.pdf',
      fullText: 'SOURCE_PAGE 1\nTEXT: Portal hypertension causes varices.',
    })

    const document = preparedSourceToDocument(payload)
    expect(document.fileName).toBe('note.pdf')
    expect(document.fullText).toContain('Portal hypertension')
  })

  it('limits generation input to requested page numbers', () => {
    const payload = requirePreparedSource({
      fileName: 'note.pdf',
      fullText: 'SOURCE_PAGE 1\nTEXT: one\n\nSOURCE_PAGE 2\nTEXT: two',
      pages: [
        { pageNumber: 1, text: 'one', extractionQuality: 'strong' },
        { pageNumber: 2, text: 'two', extractionQuality: 'strong' },
      ],
    })

    const document = preparedSourceToDocument(payload, { pageNumbers: [2] })
    expect(document.pages).toHaveLength(1)
    expect(document.fullText).toContain('two')
    expect(document.fullText).not.toContain('SOURCE_PAGE 1')
  })
})
