import type { IncomingMessage } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), localNetlifyFunctions()],
  }
})

function localNetlifyFunctions(): Plugin {
  return {
    name: 'local-netlify-functions',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/.netlify/functions/')) {
          next()
          return
        }

        try {
          const functionName = url
            .replace('/.netlify/functions/', '')
            .split('?')[0]
            .replace(/[^a-zA-Z0-9-_]/g, '')

          const mod = await server.ssrLoadModule(`/netlify/functions/${functionName}.ts`)
          const body = await readBody(req)
          const response = await mod.handler(
            {
              httpMethod: req.method,
              path: url,
              headers: req.headers,
              queryStringParameters: Object.fromEntries(new URL(url, 'http://localhost').searchParams),
              body,
              isBase64Encoded: false,
            },
            {},
          )

          res.statusCode = response.statusCode ?? 200
          for (const [key, value] of Object.entries(response.headers ?? {})) {
            res.setHeader(key, String(value))
          }
          res.end(response.body ?? '')
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Local function failed',
            }),
          )
        }
      })
    },
  }
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
