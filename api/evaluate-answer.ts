import { createVercelHandler } from '../server/http.js'
import { handleEvaluateAnswer } from '../server/routes/evaluate-answer.js'

export default createVercelHandler(handleEvaluateAnswer)
