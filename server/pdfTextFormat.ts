export interface ExtractedPdfPage {
  pageNumber: number
  text: string
}

export function buildPreparedSourceText(pages: ExtractedPdfPage[]) {
  return pages
    .map((page) => [
      `SOURCE_PAGE ${page.pageNumber}`,
      page.text ? `TEXT: ${page.text}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}
