import { buildModelTextFromPages, type SourcePageRecord } from './_sourceCoverage.js'

export const VERIFY_SOURCE_MAX_CHARS = 48_000

export function collectReferencedPageNumbers(
  questions: Array<{ pageNumber?: number | null }>,
  pagePadding = 1,
) {
  const pageNumbers = new Set<number>()

  for (const question of questions) {
    const pageNumber = question.pageNumber
    if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber)) continue

    pageNumbers.add(pageNumber)
    for (let offset = 1; offset <= pagePadding; offset += 1) {
      pageNumbers.add(pageNumber - offset)
      pageNumbers.add(pageNumber + offset)
    }
  }

  return pageNumbers
}

export function buildVerifySourceText(args: {
  pages: SourcePageRecord[]
  fullText: string
  questions: Array<{ pageNumber?: number | null }>
  maxChars?: number
  pagePadding?: number
}) {
  const maxChars = args.maxChars ?? VERIFY_SOURCE_MAX_CHARS
  const referenced = collectReferencedPageNumbers(args.questions, args.pagePadding ?? 1)

  let pages = args.pages
  if (referenced.size > 0 && pages.length) {
    const scoped = pages.filter((page) => referenced.has(page.pageNumber))
    if (scoped.length) pages = scoped
  }

  let text = pages.length ? buildModelTextFromPages(pages) : args.fullText
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n[VERIFY_SOURCE_TRUNCATED]`
  }

  return text || args.fullText.slice(0, maxChars)
}
