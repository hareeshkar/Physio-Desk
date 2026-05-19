import { describe, expect, it } from 'vitest'
import { estimateQuizMaxTokens, estimateVerifyMaxTokens } from '../_studyTokens'

describe('study token budgets', () => {
  it('scales quiz max tokens with requested counts', () => {
    expect(estimateQuizMaxTokens(20, 0)).toBe(8192)
    expect(estimateQuizMaxTokens(2, 0)).toBe(2312)
    expect(estimateQuizMaxTokens(0, 5)).toBe(4232)
  })

  it('scales verify max tokens with batch size', () => {
    expect(estimateVerifyMaxTokens(8)).toBe(2016)
    expect(estimateVerifyMaxTokens(1)).toBe(512)
    expect(estimateVerifyMaxTokens(6, { shortEssayCount: 6 })).toBe(3376)
  })
})
