export interface TimingSpan {
  name: string
  startMs: number
  endMs: number
  durationMs: number
  meta?: Record<string, number | string | boolean>
}

export interface TimingReport {
  startedAt: number
  endedAt: number
  totalMs: number
  spans: TimingSpan[]
}

export function createTimer(label = 'study') {
  const startedAt = performance.now()
  const spans: TimingSpan[] = []
  const stack: Array<{ name: string; startMs: number; meta?: Record<string, number | string | boolean> }> = []

  return {
    start(name: string, meta?: Record<string, number | string | boolean>) {
      stack.push({ name, startMs: performance.now(), meta })
    },
    end(meta?: Record<string, number | string | boolean>) {
      const current = stack.pop()
      if (!current) return
      const endMs = performance.now()
      spans.push({
        name: current.name,
        startMs: current.startMs - startedAt,
        endMs: endMs - startedAt,
        durationMs: endMs - current.startMs,
        meta: { ...current.meta, ...meta },
      })
    },
    mark(name: string, durationMs: number, meta?: Record<string, number | string | boolean>) {
      const endMs = performance.now() - startedAt
      spans.push({
        name,
        startMs: endMs - durationMs,
        endMs,
        durationMs,
        meta,
      })
    },
    toReport(): TimingReport {
      const endedAt = performance.now()
      return {
        startedAt,
        endedAt,
        totalMs: endedAt - startedAt,
        spans,
      }
    },
  }
}

export function formatTimingReport(report: TimingReport) {
  const lines = report.spans.map(
    (span) =>
      `  ${span.name}: ${span.durationMs.toFixed(1)}ms${span.meta ? ` ${JSON.stringify(span.meta)}` : ''}`,
  )
  return [`total: ${report.totalMs.toFixed(1)}ms`, ...lines].join('\n')
}
