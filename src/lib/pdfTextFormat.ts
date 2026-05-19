export interface ExtractedPdfPage {
  pageNumber: number
  text: string
}

export function normalizeExtractedText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildPreparedSourceText(pages: ExtractedPdfPage[]) {
  return pages
    .map((page) => [
      `SOURCE_PAGE ${page.pageNumber}`,
      page.text ? `TEXT: ${page.text}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}
