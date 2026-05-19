import { handlePost, optionsResponse } from '../server/http'
import { handleEvaluateAnswer } from '../server/routes/evaluate-answer'

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(request: Request) {
  return handlePost(request, handleEvaluateAnswer)
}
