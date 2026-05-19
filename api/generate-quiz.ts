import { handlePost, optionsResponse } from '../server/http'
import { handleGenerateQuiz } from '../server/routes/generate-quiz'

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(request: Request) {
  return handlePost(request, handleGenerateQuiz)
}
