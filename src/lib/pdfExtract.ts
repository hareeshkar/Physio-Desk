import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  buildExtractionWarnings,
  buildFullTextFromPages,
  detectPageExtractionQuality,
  normalizeExtractedText,
  summarizeExtraction,
  type SourcePageRecord,
} from './sourceCoverage'
import type { PreparedSource } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractPdfTextFromFile(file: File): Promise<PreparedSource> {
  if ((file.type || 'application/pdf') !== 'application/pdf') {
    throw new Error('Only PDF files can be read on this device.')
  }

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise

  try {
    const pages: SourcePageRecord[] = []

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = normalizeExtractedText(
        content.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' '),
      )

      pages.push({
        pageNumber,
        text,
        extractionQuality: detectPageExtractionQuality(text),
      })
    }

    const fullText = buildFullTextFromPages(pages)
    if (!fullText.trim()) {
      throw new Error('Could not extract readable text from this PDF on your device.')
    }

    const stats = summarizeExtraction(pages)
    const warnings = buildExtractionWarnings(stats)

    return {
      fileName: file.name,
      fullText,
      pages,
      stats,
      warnings,
    }
  } finally {
    await doc.destroy()
  }
}
