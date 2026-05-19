import { minimaxVlm } from './_minimax'
import { createPdfParser } from './_pdfRuntime'
import {
  buildModelTextFromPages,
  detectPageExtractionQuality,
  normalizeExtractedText,
  selectPagesForModel,
  type SourcePageRecord,
} from './_sourceCoverage'

export interface PdfSource {
  fileName: string
  mimeType: 'application/pdf'
  base64: string
}

export interface SourcePage {
  pageNumber: number
  text: string
  visualNotes?: string
  extractionQuality: 'strong' | 'weak' | 'visual'
}

export interface PreparedSourceDocument {
  fileName: string
  mimeType: 'application/pdf'
  pages: SourcePage[]
  fullText: string
  visualNotes: Array<{ pageNumber: number; visualNotes: string }>
  warnings: string[]
}

export interface PreparedSourcePayload {
  fileName: string
  fullText: string
  pages?: SourcePageRecord[]
  stats?: {
    pageCount: number
    weakPageCount: number
    strongPageCount: number
    visualPageCount: number
  }
  warnings?: string[]
}

export function requirePdfSource(value: unknown): PdfSource {
  const record = isRecord(value) ? value : {}
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : ''
  const base64 = typeof record.base64 === 'string' ? record.base64.trim() : ''

  if (mimeType !== 'application/pdf') {
    throw new Error('Only PDF files are supported for study generation.')
  }

  if (!fileName || !base64) {
    throw new Error('PDF source must include fileName and base64 data.')
  }

  return { fileName, mimeType, base64 }
}

export async function prepareSourceDocument(
  source: PdfSource,
  options: {
    enableVlm?: boolean
    maxVlmPages?: number
    vlmPrompt?: string
  } = {},
): Promise<PreparedSourceDocument> {
  const pages = await extractPdfPages(source)
  const warnings: string[] = []
  const visualNotes: Array<{ pageNumber: number; visualNotes: string }> = []

  if (options.enableVlm) {
    const weakPages = pages
      .filter((page) => page.extractionQuality === 'weak')
      .slice(0, options.maxVlmPages ?? 2)

    for (const page of weakPages) {
      try {
        const imageDataUri = await renderPageToImageDataUri(source, page.pageNumber)
        const notes = await minimaxVlm({
          prompt: options.vlmPrompt ?? defaultVlmPrompt(page.pageNumber),
          imageDataUri,
        })
        visualNotes.push({ pageNumber: page.pageNumber, visualNotes: notes })
      } catch (error) {
        warnings.push(`VLM page ${page.pageNumber} skipped: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
  }

  const mergedPages = mergeVisualNotes(pages, visualNotes)
  return {
    fileName: source.fileName,
    mimeType: source.mimeType,
    pages: mergedPages,
    fullText: buildPreparedSourceText(mergedPages),
    visualNotes,
    warnings,
  }
}

export async function extractPdfPages(source: PdfSource): Promise<SourcePage[]> {
  const parser = await createPdfParser({ data: Buffer.from(source.base64, 'base64') })

  try {
    const result = await parser.getText({ pageJoiner: '' })
    const pages = result.pages.map((page) => {
      const text = normalizeExtractedText(page.text)
      return {
        pageNumber: page.num,
        text,
        extractionQuality: detectExtractionQuality(text),
      }
    })

    if (!pages.length) {
      throw new Error('Could not extract readable pages from this PDF.')
    }

    return pages
  } finally {
    await parser.destroy()
  }
}

export async function renderPageToImageDataUri(source: PdfSource, pageNumber: number): Promise<string> {
  const parser = await createPdfParser({ data: Buffer.from(source.base64, 'base64') })

  try {
    const result = await parser.getScreenshot({
      partial: [pageNumber],
      imageDataUrl: true,
      imageBuffer: false,
      desiredWidth: 1200,
    })
    const dataUrl = result.pages[0]?.dataUrl
    if (!dataUrl) throw new Error('Could not render PDF page image.')
    return dataUrl
  } finally {
    await parser.destroy()
  }
}

export function detectExtractionQuality(text: string): SourcePage['extractionQuality'] {
  return normalizeExtractedText(text).length >= 160 ? 'strong' : 'weak'
}

export function mergeVisualNotes(
  pages: SourcePage[],
  notes: Array<{ pageNumber: number; visualNotes: string }>,
): SourcePage[] {
  const notesByPage = new Map(notes.map((note) => [note.pageNumber, note.visualNotes]))

  return pages.map((page) => {
    const visualNotes = notesByPage.get(page.pageNumber)
    return visualNotes
      ? { ...page, visualNotes, extractionQuality: 'visual' }
      : page
  })
}

export function requirePreparedSource(value: unknown): PreparedSourcePayload {
  const record = isRecord(value) ? value : {}
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  const fullText = typeof record.fullText === 'string' ? record.fullText.trim() : ''
  const pages = parsePreparedPages(record.pages)
  const warnings = toStringArray(record.warnings)

  if (!fileName || !fullText) {
    throw new Error('Prepared source must include fileName and fullText.')
  }

  return {
    fileName,
    fullText,
    pages: pages.length ? pages : undefined,
    stats: parsePreparedStats(record.stats),
    warnings: warnings.length ? warnings : undefined,
  }
}

export function preparedSourceToDocument(
  payload: PreparedSourcePayload,
  options: { pageNumbers?: number[] } = {},
): PreparedSourceDocument {
  const pages = payload.pages?.length
    ? selectPagesForModel(payload.pages, options.pageNumbers)
    : []

  const fullText = pages.length
    ? buildModelTextFromPages(pages)
    : payload.fullText

  return {
    fileName: payload.fileName,
    mimeType: 'application/pdf',
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
      extractionQuality: page.extractionQuality,
      visualNotes: page.visualNotes,
    })),
    fullText,
    visualNotes: pages
      .filter((page) => page.visualNotes)
      .map((page) => ({ pageNumber: page.pageNumber, visualNotes: page.visualNotes! })),
    warnings: [...(payload.warnings ?? [])],
  }
}

export async function resolveStudySource(args: {
  pdfSource?: unknown
  preparedSource?: unknown
  pageNumbers?: number[]
}): Promise<PreparedSourceDocument> {
  if (args.preparedSource) {
    return preparedSourceToDocument(requirePreparedSource(args.preparedSource), {
      pageNumbers: args.pageNumbers,
    })
  }

  if (args.pdfSource) {
    return prepareSourceDocument(requirePdfSource(args.pdfSource), { enableVlm: false })
  }

  throw new Error('Request must include preparedSource or pdfSource.')
}

export function buildPreparedSourceText(pages: SourcePage[]) {
  return pages
    .map((page) => [
      `SOURCE_PAGE ${page.pageNumber}`,
      page.text ? `TEXT: ${page.text}` : '',
      page.visualNotes ? `VISUAL_NOTES: ${page.visualNotes}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}

export function buildImageDataUri(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`
}

function defaultVlmPrompt(pageNumber: number) {
  return `Extract exam-relevant text, labels, tables, diagrams, definitions, causes, clinical features, morphology, complications, and relationships visible on PDF page ${pageNumber}. Do not infer beyond the image. Return concise page notes with quoted labels when possible.`
}

function parsePreparedPages(value: unknown): SourcePageRecord[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      const record = isRecord(item) ? item : {}
      const pageNumber = typeof record.pageNumber === 'number' && Number.isFinite(record.pageNumber)
        ? record.pageNumber
        : index + 1
      const text = typeof record.text === 'string' ? normalizeExtractedText(record.text) : ''
      const extractionQuality = record.extractionQuality === 'weak'
        || record.extractionQuality === 'visual'
        || record.extractionQuality === 'strong'
        ? record.extractionQuality
        : detectPageExtractionQuality(text)
      const visualNotes = typeof record.visualNotes === 'string' ? record.visualNotes.trim() : undefined

      return {
        pageNumber,
        text,
        extractionQuality,
        visualNotes: visualNotes || undefined,
      }
    })
    .filter((page) => page.pageNumber > 0)
}

function parsePreparedStats(value: unknown) {
  if (!isRecord(value)) return undefined
  const pageCount = typeof value.pageCount === 'number' ? value.pageCount : 0
  const weakPageCount = typeof value.weakPageCount === 'number' ? value.weakPageCount : 0
  const strongPageCount = typeof value.strongPageCount === 'number' ? value.strongPageCount : 0
  const visualPageCount = typeof value.visualPageCount === 'number' ? value.visualPageCount : 0
  if (!pageCount) return undefined
  return { pageCount, weakPageCount, strongPageCount, visualPageCount }
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
