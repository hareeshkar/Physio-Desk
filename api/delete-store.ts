import { handlePost, optionsResponse } from '../server/http'
import { handleDeleteStore } from '../server/routes/delete-store'

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(request: Request) {
  return handlePost(request, handleDeleteStore)
}
