import { createVercelHandler } from '../server/http.js'
import { handleVerifyQuiz } from '../server/routes/verify-quiz.js'

export default createVercelHandler(handleVerifyQuiz)
