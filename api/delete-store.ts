import { createVercelHandler } from '../server/http.js'
import { handleDeleteStore } from '../server/routes/delete-store.js'

export default createVercelHandler(handleDeleteStore)
