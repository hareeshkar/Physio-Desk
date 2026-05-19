export interface ClientTimingSpan {
  name: string
  durationMs: number
  meta?: Record<string, string | number | boolean>
}

export function createClientTimer() {
  const spans: ClientTimingSpan[] = []

  return {
    async measure<T>(name: string, fn: () => Promise<T>, meta?: Record<string, string | number | boolean>) {
      const start = performance.now()
      try {
        return await fn()
      } finally {
        spans.push({
          name,
          durationMs: performance.now() - start,
          meta,
        })
      }
    },
    getSpans() {
      return spans
    },
    totalMs() {
      return spans.reduce((sum, span) => sum + span.durationMs, 0)
    },
    log(prefix = '[timing]') {
      for (const span of spans) {
        const meta = span.meta ? ` ${JSON.stringify(span.meta)}` : ''
        console.log(`${prefix} ${span.name}: ${span.durationMs.toFixed(1)}ms${meta}`)
      }
      console.log(`${prefix} sum(spans): ${this.totalMs().toFixed(1)}ms`)
    },
  }
}
