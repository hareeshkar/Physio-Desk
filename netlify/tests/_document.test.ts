import { describe, expect, it } from 'vitest'
import {
  buildImageDataUri,
  buildPreparedSourceText,
  detectExtractionQuality,
  mergeVisualNotes,
  requirePdfSource,
  type SourcePage,
} from '../functions/_document'

describe('document preparation helpers', () => {
  it('requires a PDF source with base64 data', () => {
    expect(requirePdfSource({
      fileName: 'note.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0x',
    })).toEqual({
      fileName: 'note.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0x',
    })
  })

  it('detects weak and strong extracted pages', () => {
    expect(detectExtractionQuality('')).toBe('weak')
    expect(detectExtractionQuality('short text')).toBe('weak')
    expect(detectExtractionQuality('This page has enough extracted text to be useful for grounded question generation. '.repeat(4))).toBe('strong')
  })

  it('merges VLM visual notes into the correct page', () => {
    const pages: SourcePage[] = [
      { pageNumber: 1, text: 'Normal text', extractionQuality: 'strong' },
      { pageNumber: 2, text: '', extractionQuality: 'weak' },
    ]

    const merged = mergeVisualNotes(pages, [{ pageNumber: 2, visualNotes: 'Diagram: reflux causes metaplasia.' }])

    expect(merged[1]).toMatchObject({
      pageNumber: 2,
      visualNotes: 'Diagram: reflux causes metaplasia.',
      extractionQuality: 'visual',
    })
  })

  it('builds page-labeled source text with text and visual notes', () => {
    const source = buildPreparedSourceText([
      { pageNumber: 1, text: 'Text evidence', extractionQuality: 'strong' },
      { pageNumber: 2, text: '', visualNotes: 'Visual evidence', extractionQuality: 'visual' },
    ])

    expect(source).toContain('SOURCE_PAGE 1')
    expect(source).toContain('TEXT: Text evidence')
    expect(source).toContain('SOURCE_PAGE 2')
    expect(source).toContain('VISUAL_NOTES: Visual evidence')
  })

  it('builds image data URIs for MiniMax VLM', () => {
    expect(buildImageDataUri('image/png', 'abc')).toBe('data:image/png;base64,abc')
  })
})
