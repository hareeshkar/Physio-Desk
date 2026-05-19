import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareSourceDocument, requirePdfSource } from '../server/_document.ts'
import { planPageChunks, summarizeExtraction } from '../src/lib/sourceCoverage.ts'

const pdfName = process.argv[2]
if (!pdfName) {
  console.error('Usage: vite-node scripts/parse-pdf-stats.mjs "<pdf file name>"')
  process.exit(1)
}

await loadLocalEnv()
const bytes = await readFile(resolve(process.cwd(), pdfName))
const t0 = performance.now()
const source = await prepareSourceDocument(
  requirePdfSource({
    fileName: pdfName,
    mimeType: 'application/pdf',
    base64: bytes.toString('base64'),
  }),
  { enableVlm: false },
)
const parseMs = Math.round(performance.now() - t0)
const stats = summarizeExtraction(source.pages)

console.log(
  JSON.stringify(
    {
      pdfName,
      parseMs,
      pages: stats.pageCount,
      chars: source.fullText.length,
      weakPages: stats.weakPageCount,
      chunks28k: planPageChunks(source.pages, 28_000).length,
      chunks55k: planPageChunks(source.pages, 55_000).length,
    },
    null,
    2,
  ),
)

async function loadLocalEnv() {
  try {
    const envFile = await readFile(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // optional
  }
}
