import { createVercelHandler } from '../server/http.js'
import { handleGenerateQuiz } from '../server/routes/generate-quiz.js'

export default createVercelHandler(handleGenerateQuiz)
