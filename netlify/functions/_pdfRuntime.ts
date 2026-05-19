export async function ensurePdfGeometryGlobals() {
  if (globalThis.DOMMatrix && globalThis.DOMPoint && globalThis.DOMRect) return

  const geometry = await import('@napi-rs/canvas/geometry')
  globalThis.DOMMatrix ??= geometry.DOMMatrix
  globalThis.DOMPoint ??= geometry.DOMPoint
  globalThis.DOMRect ??= geometry.DOMRect
}

export async function loadPdfParse() {
  await ensurePdfGeometryGlobals()
  return import('pdf-parse')
}
