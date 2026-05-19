import { createVercelHandler } from '../server/http.js'
import { handleUploadResource } from '../server/routes/upload-resource.js'

export default createVercelHandler(handleUploadResource)
