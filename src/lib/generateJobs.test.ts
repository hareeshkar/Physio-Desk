import { describe, expect, it } from 'vitest'
import { detectPageExtractionQuality, type SourcePageRecord } from './sourceCoverage'
import { planGenerateJobs } from './generateJobs'

function page(pageNumber: number): SourcePageRecord {
  return {
    pageNumber,
    text: 'x'.repeat(500),
    extractionQuality: detectPageExtractionQuality('x'.repeat(500)),
  }
}

describe('planGenerateJobs', () => {
  it('splits large MCQ sessions across two page halves for parallel generate', () => {
    const pages = Array.from({ length: 76 }, (_, index) => page(index + 1))
    const jobs = planGenerateJobs(pages, { mcq: 20, shortEssay: 0 })

    expect(jobs).toHaveLength(2)
    expect(jobs[0]?.counts).toEqual({ mcq: 10, shortEssay: 0 })
    expect(jobs[1]?.counts).toEqual({ mcq: 10, shortEssay: 0 })
    expect(jobs[0]?.pageNumbers[0]).toBe(1)
    expect(jobs[1]?.pageNumbers[0]).toBe(39)
  })

  it('keeps small MCQ sessions as a single job', () => {
    const pages = Array.from({ length: 76 }, (_, index) => page(index + 1))
    const jobs = planGenerateJobs(pages, { mcq: 5, shortEssay: 0 })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.counts).toEqual({ mcq: 5, shortEssay: 0 })
  })
})
