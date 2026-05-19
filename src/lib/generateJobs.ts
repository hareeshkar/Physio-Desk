import { planPageChunks, splitCountsAcrossChunks, type SourcePageRecord } from './sourceCoverage'
import type { QuestionCounts } from './questionSelection'

export interface GenerateJob {
  pageNumbers: number[]
  counts: QuestionCounts
}

/** When one chunk would be a long generate call, split pages for parallel MiniMax requests. */
export function planGenerateJobs(
  pages: SourcePageRecord[],
  counts: QuestionCounts,
  options: { parallelMcqThreshold?: number; minPagesForParallel?: number } = {},
): GenerateJob[] {
  const parallelMcqThreshold = options.parallelMcqThreshold ?? 14
  const minPagesForParallel = options.minPagesForParallel ?? 24
  const chunks = planPageChunks(pages)

  if (chunks.length > 1) {
    return chunks.map((chunk, index) => ({
      pageNumbers: chunk.pageNumbers,
      counts: splitCountsAcrossChunks(counts, index, chunks.length),
    }))
  }

  if (
    counts.mcq >= parallelMcqThreshold &&
    counts.shortEssay === 0 &&
    pages.length >= minPagesForParallel
  ) {
    const midpoint = Math.ceil(pages.length / 2)
    const firstPages = pages.slice(0, midpoint)
    const secondPages = pages.slice(midpoint)
    return [
      {
        pageNumbers: firstPages.map((page) => page.pageNumber),
        counts: splitCountsAcrossChunks(counts, 0, 2),
      },
      {
        pageNumbers: secondPages.map((page) => page.pageNumber),
        counts: splitCountsAcrossChunks(counts, 1, 2),
      },
    ]
  }

  return [{ pageNumbers: [], counts }]
}
