import { describe, expect, it } from 'vitest'
import {
  buildImageDataUri,
  buildPreparedSourceText,
  detectExtractionQuality,
  MAX_MODEL_SOURCE_TEXT_CHARS,
  mergeVisualNotes,
  requirePdfSource,
  truncateSourceTextForModel,
  withModelSourceText,
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

  it('truncates oversized source text for model calls', () => {
    const longText = 'x'.repeat(MAX_MODEL_SOURCE_TEXT_CHARS + 500)
    const truncated = truncateSourceTextForModel(longText)

    expect(truncated.text.length).toBeLessThan(longText.length)
    expect(truncated.text).toContain('[SOURCE TEXT TRUNCATED FOR LENGTH]')
    expect(truncated.warnings[0]).toContain('truncated')
  })

  it('adds truncation warnings to prepared source documents', () => {
    const source = withModelSourceText({
      fileName: 'note.pdf',
      mimeType: 'application/pdf',
      pages: [],
      fullText: 'y'.repeat(MAX_MODEL_SOURCE_TEXT_CHARS + 100),
      visualNotes: [],
      warnings: [],
    })

    expect(source.warnings.length).toBeGreaterThan(0)
    expect(source.fullText).toContain('[SOURCE TEXT TRUNCATED FOR LENGTH]')
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
