import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareSourceDocument, requirePdfSource } from '../server/_document.ts'
import {
  evaluateMiniMaxEssay,
  generateMiniMaxQuiz,
  verifyMiniMaxQuestion,
} from '../server/_minimaxStudy.ts'
import { buildLocalMcqFeedback } from '../src/lib/mcqFeedback.ts'

const REQUIRED_MCQ = 2
const REQUIRED_SHORT = 1
const CHOICE_COUNT = 4

await loadLocalEnv()

if (!process.env.MINIMAX_API_KEY) {
  throw new Error('MINIMAX_API_KEY is not configured in .env or the environment.')
}

const fileName = 'Gastrointestinal Pathology ..pdf'
const pdfSource = requirePdfSource({
  fileName,
  mimeType: 'application/pdf',
  base64: (await readFile(resolve(process.cwd(), fileName))).toString('base64'),
})
const source = await prepareSourceDocument(pdfSource, { enableVlm: false })
const generated = await generateMiniMaxQuiz({
  source,
  requestedMcq: REQUIRED_MCQ,
  requestedShort: REQUIRED_SHORT,
  choiceCount: CHOICE_COUNT,
  previousQuestions: [],
})

assertQuizStructure(generated)

const verificationResults = []
for (const question of generated.questions) {
  const verification = await verifyMiniMaxQuestion({ source, question })
  verificationResults.push(...verification.results)
}
assert(verificationResults.length === generated.questions.length, 'verification must return one result per question.')

const mcq = generated.questions.find((question) => question.type === 'mcq')
const essay = generated.questions.find((question) => question.type === 'short_essay')
assert(mcq, 'generated quiz must include an MCQ.')
assert(essay, 'generated quiz must include a short essay.')

const mcqFeedback = buildLocalMcqFeedback({
  ...mcq,
  sessionId: 'verify-session',
  resourceId: 'verify-resource',
  verificationStatus: 'accepted',
}, mcq.correctChoiceId)
assert(mcqFeedback.isCorrect === true, 'local MCQ feedback should mark correct answer as correct.')

const essayEvaluation = await evaluateMiniMaxEssay({
  source,
  question: essay,
  userAnswer: essay.expectedAnswer,
})
assert(typeof essayEvaluation.score === 'number', 'essay evaluation must include numeric score.')

console.log('MiniMax structure verification passed.')
console.log(`${generated.questions.filter((question) => question.type === 'mcq').length} MCQ + ${generated.questions.filter((question) => question.type === 'short_essay').length} short essay; ${verificationResults.length} verification results; essay score ${essayEvaluation.score}.`)
if (source.warnings.length) console.log(`source warnings: ${source.warnings.join(' ')}`)

function assertQuizStructure(response) {
  assert(Array.isArray(response.questions), 'questions must be an array.')
  assert(response.questions.filter((question) => question.type === 'mcq').length === REQUIRED_MCQ, `expected ${REQUIRED_MCQ} MCQs.`)
  assert(response.questions.filter((question) => question.type === 'short_essay').length === REQUIRED_SHORT, `expected ${REQUIRED_SHORT} short essays.`)

  for (const question of response.questions) {
    assertNonEmptyString(question.id, 'question id')
    assert(question.type === 'mcq' || question.type === 'short_essay', 'question type')
    assertNonEmptyString(question.prompt, 'question prompt')
    assertNonEmptyString(question.expectedAnswer, 'expectedAnswer')
    assertNonEmptyString(question.evidenceQuote, 'evidenceQuote')

    if (question.type === 'mcq') {
      assert(Array.isArray(question.choices) && question.choices.length === CHOICE_COUNT, 'MCQ must have exact choice count.')
      const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId)
      assert(correctChoice, 'MCQ correctChoiceId must match a choice.')
      assert(normalize(correctChoice.text) === normalize(question.expectedAnswer), 'expectedAnswer must match correct option text.')
    }
  }
}

function assertNonEmptyString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be non-empty.`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function normalize(value) {
  return String(value).trim().replace(/\s+/g, ' ').replace(/[.。]+$/u, '').toLowerCase()
}

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env')
  return readFile(envPath, 'utf8')
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const separator = trimmed.indexOf('=')
        if (separator === -1) continue
        const key = trimmed.slice(0, separator).trim()
        const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key && process.env[key] === undefined) process.env[key] = value
      }
    })
    .catch(() => {})
}
