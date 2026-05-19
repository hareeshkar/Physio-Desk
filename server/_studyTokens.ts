export function estimateQuizMaxTokens(requestedMcq: number, requestedShort: number) {
  const mcqCandidates = requestedMcq > 0 ? requestedMcq + 2 : 0
  const shortCandidates = requestedShort > 0 ? requestedShort + 1 : 0
  const estimate = mcqCandidates * 450 + shortCandidates * 620 + 512
  const floor = requestedShort > 0 && requestedMcq === 0 ? 4096 : 1024
  return Math.min(8192, Math.max(floor, estimate))
}

export function estimateVerifyMaxTokens(
  questionCount: number,
  options: { shortEssayCount?: number } = {},
) {
  const essays = options.shortEssayCount ?? 0
  const mcqs = Math.max(0, questionCount - essays)
  const estimate = mcqs * 220 + essays * 520 + 256
  const floor = essays > 0 ? 2048 : 512
  return Math.min(4096, Math.max(floor, estimate))
}
