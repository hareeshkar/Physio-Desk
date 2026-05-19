import { buildPreparedSourceText, type ExtractedPdfPage } from './pdfTextFormat'

export type ExtractionQuality = 'strong' | 'weak' | 'visual'

export interface SourcePageRecord extends ExtractedPdfPage {
  extractionQuality: ExtractionQuality
  visualNotes?: string
}

/** Per-chunk budget sized for Netlify-friendly MiniMax calls (~20–35s). */
export const GENERATE_CHUNK_TARGET_CHARS = 28_000

/** Hard ceiling before we refuse a single prompt (MiniMax context is much larger). */
export const MODEL_ABSOLUTE_MAX_CHARS = 180_000

const WEAK_PAGE_TEXT_THRESHOLD = 160

export function detectPageExtractionQuality(text: string): ExtractionQuality {
  return normalizeExtractedText(text).length >= WEAK_PAGE_TEXT_THRESHOLD ? 'strong' : 'weak'
}

export function normalizeExtractedText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatSourcePage(page: SourcePageRecord) {
  return [
    `SOURCE_PAGE ${page.pageNumber}`,
    page.text ? `TEXT: ${page.text}` : '',
    page.visualNotes ? `VISUAL_NOTES: ${page.visualNotes}` : '',
  ].filter(Boolean).join('\n')
}

export function buildFullTextFromPages(pages: SourcePageRecord[]) {
  return buildPreparedSourceText(pages)
}

export function summarizeExtraction(pages: SourcePageRecord[]) {
  const weakPageCount = pages.filter((page) => page.extractionQuality === 'weak').length
  const strongPageCount = pages.filter((page) => page.extractionQuality === 'strong').length
  const visualPageCount = pages.filter((page) => page.extractionQuality === 'visual').length

  return {
    pageCount: pages.length,
    weakPageCount,
    strongPageCount,
    visualPageCount,
  }
}

export function buildExtractionWarnings(stats: ReturnType<typeof summarizeExtraction>) {
  const warnings: string[] = []
  if (stats.pageCount === 0) {
    warnings.push('No readable pages were extracted from this PDF.')
    return warnings
  }

  if (stats.weakPageCount > 0) {
    warnings.push(
      `${stats.weakPageCount} of ${stats.pageCount} pages had little extractable text (often image-heavy slides). Questions may miss diagram-only facts until visual extraction is added.`,
    )
  }

  return warnings
}

export function planPageChunks(
  pages: SourcePageRecord[],
  targetChars = GENERATE_CHUNK_TARGET_CHARS,
) {
  if (!pages.length) return []

  const chunks: Array<{ pageNumbers: number[]; charCount: number }> = []
  let currentPages: SourcePageRecord[] = []
  let currentChars = 0

  for (const page of pages) {
    const pageChars = formatSourcePage(page).length + 2
    if (currentPages.length > 0 && currentChars + pageChars > targetChars) {
      chunks.push({
        pageNumbers: currentPages.map((item) => item.pageNumber),
        charCount: currentChars,
      })
      currentPages = []
      currentChars = 0
    }
    currentPages.push(page)
    currentChars += pageChars
  }

  if (currentPages.length) {
    chunks.push({
      pageNumbers: currentPages.map((item) => item.pageNumber),
      charCount: currentChars,
    })
  }

  return chunks
}

export function selectPagesForModel(
  pages: SourcePageRecord[],
  pageNumbers?: number[],
) {
  if (!pageNumbers?.length) return pages
  const allowed = new Set(pageNumbers)
  return pages.filter((page) => allowed.has(page.pageNumber))
}

import type { QuestionCounts } from './questionSelection'

/** Split a session quota across PDF chunks so we do not ask for 20 MCQs per chunk. */
export function splitCountsAcrossChunks(
  counts: QuestionCounts,
  chunkIndex: number,
  chunkCount: number,
): QuestionCounts {
  if (chunkCount <= 1) return counts

  const mcqBase = Math.floor(counts.mcq / chunkCount)
  const mcqRemainder = counts.mcq % chunkCount
  const shortBase = Math.floor(counts.shortEssay / chunkCount)
  const shortRemainder = counts.shortEssay % chunkCount

  return {
    mcq: mcqBase + (chunkIndex < mcqRemainder ? 1 : 0),
    shortEssay: shortBase + (chunkIndex < shortRemainder ? 1 : 0),
  }
}

export function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    unique.push(trimmed)
  }
  return unique
}

export function buildModelTextFromPages(pages: SourcePageRecord[]) {
  const text = buildFullTextFromPages(pages)
  if (!text.trim()) {
    throw new Error('Selected PDF pages did not contain readable text.')
  }
  if (text.length > MODEL_ABSOLUTE_MAX_CHARS) {
    throw new Error(
      `Selected source text is too long for one model call (${text.length} characters). The app will split generation across page ranges automatically.`,
    )
  }
  return text
}
