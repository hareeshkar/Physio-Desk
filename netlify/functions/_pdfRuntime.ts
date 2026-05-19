type PdfParseModule = typeof import('pdf-parse')
type PdfParseCtor = PdfParseModule['PDFParse']
type PdfParseOptions = ConstructorParameters<PdfParseCtor>[0]

let pdfParseModule: PdfParseModule | null = null
let pdfCanvasFactory: PdfParseOptions['CanvasFactory']

export async function ensurePdfGeometryGlobals() {
  if (globalThis.DOMMatrix && globalThis.DOMPoint && globalThis.DOMRect) return

  const geometry = await import('@napi-rs/canvas/geometry')
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

  const workerModule = await import('pdf-parse/worker')
  await ensurePdfWorkerHandler()

  const module = await import('pdf-parse')
  module.PDFParse.setWorker(workerModule.getData())

  pdfCanvasFactory = workerModule.CanvasFactory
  pdfParseModule = module
  return module
}

export async function createPdfParser(options: PdfParseOptions) {
  const { PDFParse } = await loadPdfParse()
  return new PDFParse({
    ...options,
    CanvasFactory: options.CanvasFactory ?? pdfCanvasFactory,
  })
}
