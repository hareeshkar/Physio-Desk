/** +1 candidate buffer (was +2) — enough for verify rejects without extra generation latency. */
export const MCQ_GENERATION_BUFFER = 1
export const SHORT_GENERATION_BUFFER = 1

export function estimateQuizMaxTokens(requestedMcq: number, requestedShort: number) {
  const mcqCandidates = requestedMcq > 0 ? requestedMcq + MCQ_GENERATION_BUFFER : 0
  const shortCandidates = requestedShort > 0 ? requestedShort + SHORT_GENERATION_BUFFER : 0
  const estimate = mcqCandidates * 420 + shortCandidates * 580 + 480
  const floor = requestedShort > 0 && requestedMcq === 0 ? 4096 : 1024
  return Math.min(8192, Math.max(floor, estimate))
}

export function estimateVerifyMaxTokens(
  questionCount: number,
  options: { shortEssayCount?: number } = {},
) {
  const essays = options.shortEssayCount ?? 0
  const mcqs = Math.max(0, questionCount - essays)
  const estimate = mcqs * 200 + essays * 480 + 240
  const floor = essays > 0 ? 2048 : 512
  return Math.min(4096, Math.max(floor, estimate))
}
