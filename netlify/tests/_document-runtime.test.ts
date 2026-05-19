import { describe, expect, it } from 'vitest'

async function withoutDomGeometryGlobals(run: () => Promise<void>) {
  const originalDOMMatrix = globalThis.DOMMatrix
  const originalDOMPoint = globalThis.DOMPoint
  const originalDOMRect = globalThis.DOMRect

  try {
    Reflect.deleteProperty(globalThis, 'DOMMatrix')
    Reflect.deleteProperty(globalThis, 'DOMPoint')
    Reflect.deleteProperty(globalThis, 'DOMRect')
    await run()
  } finally {
    if (originalDOMMatrix) globalThis.DOMMatrix = originalDOMMatrix
    if (originalDOMPoint) globalThis.DOMPoint = originalDOMPoint
    if (originalDOMRect) globalThis.DOMRect = originalDOMRect
  }
}

describe('document runtime setup', () => {
  it('loads without browser DOM geometry globals', async () => {
    await withoutDomGeometryGlobals(async () => {
      await expect(import('../functions/_document')).resolves.toHaveProperty('extractPdfPages')
    })
  })

  it('loads gemini helpers without browser DOM geometry globals', async () => {
    await withoutDomGeometryGlobals(async () => {
      await expect(import('../functions/_gemini')).resolves.toHaveProperty('buildQuizPrompt')
    })
  })
})
