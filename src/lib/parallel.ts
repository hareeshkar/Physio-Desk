export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export function chunkArray<T>(items: T[], size: number) {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/** Balance batch sizes so parallel verify calls finish around the same time. */
export function planVerifyBatches(questionCount: number, maxBatchSize = 12) {
  if (questionCount <= maxBatchSize) return [questionCount]

  const batchCount = Math.ceil(questionCount / maxBatchSize)
  const base = Math.floor(questionCount / batchCount)
  const remainder = questionCount % batchCount
  const sizes: number[] = []

  for (let index = 0; index < batchCount; index += 1) {
    sizes.push(base + (index < remainder ? 1 : 0))
  }

  return sizes
}
