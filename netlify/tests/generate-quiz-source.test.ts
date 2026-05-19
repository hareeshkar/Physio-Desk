import { describe, expect, it } from 'vitest'
import { preparedSourceToDocument, requirePreparedSource } from '../functions/_document'

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
})
