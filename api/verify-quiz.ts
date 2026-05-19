import { handlePost, optionsResponse } from '../server/http'
import { handleVerifyQuiz } from '../server/routes/verify-quiz'

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(request: Request) {
  return handlePost(request, handleVerifyQuiz)
}
