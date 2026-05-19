import { describe, expect, it } from 'vitest'

describe('document runtime setup', () => {
  it('loads without browser DOM geometry globals', async () => {
    const originalDOMMatrix = globalThis.DOMMatrix
    const originalDOMPoint = globalThis.DOMPoint
    const originalDOMRect = globalThis.DOMRect

    try {
      Reflect.deleteProperty(globalThis, 'DOMMatrix')
      Reflect.deleteProperty(globalThis, 'DOMPoint')
      Reflect.deleteProperty(globalThis, 'DOMRect')

      await expect(import('../functions/_document')).resolves.toHaveProperty('extractPdfPages')
    } finally {
      if (originalDOMMatrix) globalThis.DOMMatrix = originalDOMMatrix
      if (originalDOMPoint) globalThis.DOMPoint = originalDOMPoint
      if (originalDOMRect) globalThis.DOMRect = originalDOMRect
    }
  })
})
