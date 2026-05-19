import { describe, expect, it } from 'vitest'
import { planVerifyBatches } from './parallel'

describe('planVerifyBatches', () => {
  it('uses one batch for small sets', () => {
    expect(planVerifyBatches(8)).toEqual([8])
  })

  it('balances two parallel batches for 21 questions', () => {
    expect(planVerifyBatches(21)).toEqual([11, 10])
  })

  it('balances two parallel batches for 22 questions', () => {
    expect(planVerifyBatches(22)).toEqual([11, 11])
  })
})
