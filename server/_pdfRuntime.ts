type PdfParseModule = typeof import('pdf-parse')
type PdfParseCtor = PdfParseModule['PDFParse']
type PdfParseOptions = ConstructorParameters<PdfParseCtor>[0]

let pdfParseModule: PdfParseModule | null = null

export async function ensurePdfGeometryGlobals() {
  if (globalThis.DOMMatrix && globalThis.DOMPoint && globalThis.DOMRect) return

  const geometry = await import('@napi-rs/canvas/geometry.js')
  globalThis.DOMMatrix ??= geometry.DOMMatrix
  globalThis.DOMPoint ??= geometry.DOMPoint
  globalThis.DOMRect ??= geometry.DOMRect
}

async function ensurePdfWorkerHandler() {
  if (globalThis.pdfjsWorker?.WorkerMessageHandler) return
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
}

export async function loadPdfParse(): Promise<PdfParseModule> {
  if (pdfParseModule) return pdfParseModule

  await ensurePdfGeometryGlobals()
  await ensurePdfWorkerHandler()

  pdfParseModule = await import('pdf-parse')
  return pdfParseModule
}

export async function createPdfParser(options: PdfParseOptions) {
  const { PDFParse } = await loadPdfParse()
  return new PDFParse(options)
}
