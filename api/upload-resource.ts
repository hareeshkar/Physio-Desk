import { handlePost, optionsResponse } from '../server/http'
import { handleUploadResource } from '../server/routes/upload-resource'

export async function OPTIONS() {
  return optionsResponse()
}

export async function POST(request: Request) {
  return handlePost(request, handleUploadResource)
}
