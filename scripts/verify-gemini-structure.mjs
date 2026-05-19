import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { GoogleGenAI } from '@google/genai'
import {
  buildQuizPrompt,
  FALLBACK_MODEL_IDS,
  generateContentWithPdfFallback,
  groundedSystemInstruction,
  MODEL_ID,
  normalizeEvaluationResponse,
  normalizeQuizResponse,
  normalizeVerificationResponse,
  parseGeminiJson,
  quizResponseSchema,
  verificationSchema,
  evaluationSchema,
} from '../server/_gemini.ts'

const REQUIRED_MCQ = 2
const REQUIRED_SHORT = 1
const CHOICE_COUNT = 4

await loadLocalEnv()

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not configured in .env or the environment.')
}

const ai = new GoogleGenAI({ apiKey })
const pdfSource = await loadRootPdfSource()

const primary = await runModelPath('primary', MODEL_ID, pdfSource)
const fallback = await runModelPath('fallback', FALLBACK_MODEL_IDS[0], pdfSource)

console.log('Gemini direct-PDF structure verification passed.')
printPathResult(primary)
printPathResult(fallback)

async function runModelPath(label, model, source) {
  const generated = await generateQuiz(model, source)
  assertQuizStructure(generated, label)

  const verification = await verifyQuiz(model, source, generated.questions)
  assertVerificationStructure(verification, generated.questions, label)

  const mcq = generated.questions.find((question) => question.type === 'mcq')
  const essay = generated.questions.find((question) => question.type === 'short_essay')
  if (!mcq || !essay) throw new Error(`${label}: generated quiz did not include both question types.`)

  const mcqEvaluation = await evaluateAnswer(model, source, mcq, {
    selectedChoiceId: mcq.correctChoiceId,
  })
  const essayEvaluation = await evaluateAnswer(model, source, essay, {
    userAnswer: essay.expectedAnswer,
  })
  assertEvaluationStructure(mcqEvaluation, `${label} MCQ evaluation`)
  assertEvaluationStructure(essayEvaluation, `${label} essay evaluation`)

  return {
    label,
    model,
    generated: `${countQuestions(generated, 'mcq')} MCQ + ${countQuestions(generated, 'short_essay')} short essay`,
    verification: `${verification.results.length} results`,
    evaluations: `MCQ score ${mcqEvaluation.score}, essay score ${essayEvaluation.score}`,
    warnings: [
      ...generated.warnings,
      ...verification.warnings,
      ...mcqEvaluation.warnings,
      ...essayEvaluation.warnings,
    ],
  }
}

async function generateQuiz(model, source) {
  const response = await generateContentWithPdfFallback(ai, {
    model,
    config: {
      systemInstruction: groundedSystemInstruction,
      responseMimeType: 'application/json',
      responseSchema: quizResponseSchema,
      maxOutputTokens: 4096,
      candidateCount: 1,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  }, buildQuizPrompt({
      requestedMcq: REQUIRED_MCQ,
      requestedShort: REQUIRED_SHORT,
      choiceCount: CHOICE_COUNT,
      previousQuestions: [],
    })
      + `\nVerification run requirement: return exactly ${REQUIRED_MCQ} MCQ questions and exactly ${REQUIRED_SHORT} short_essay questions in the questions array, not candidate counts.`,
    source,
  )

  return normalizeQuizResponse(
    parseGeminiJson(response.text, '{"resourceTitle":"","questions":[]}', 'verify-script generate-quiz'),
    'verify-script generate-quiz',
  )
}

async function verifyQuiz(model, source, questions) {
  const response = await generateContentWithPdfFallback(ai, {
    model,
    config: {
      systemInstruction: groundedSystemInstruction,
      responseMimeType: 'application/json',
      responseSchema: verificationSchema,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  }, `Verify these generated study questions against the attached PDF source. Return one result per question.\n\n${JSON.stringify(questions)}`, source)

  return normalizeVerificationResponse(
    parseGeminiJson(response.text, '{"results":[]}', 'verify-script verify-quiz'),
    'verify-script verify-quiz',
  )
}

async function evaluateAnswer(model, source, question, answer) {
  const isMcq = question.type === 'mcq'
  const selectedChoice = isMcq
    ? question.choices.find((choice) => choice.id === answer.selectedChoiceId)
    : undefined
  const correctChoice = isMcq
    ? question.choices.find((choice) => choice.id === question.correctChoiceId)
    : undefined

  const response = await generateContentWithPdfFallback(ai, {
    model,
    config: {
      systemInstruction: groundedSystemInstruction,
      responseMimeType: 'application/json',
      responseSchema: evaluationSchema,
      maxOutputTokens: isMcq ? 1024 : 2048,
      thinkingConfig: { thinkingLevel: isMcq ? 'minimal' : 'low' },
    },
  }, `Evaluate this student's answer using only the attached PDF source and the provided evidence quote.

Question: ${question.prompt}
Expected answer: ${question.expectedAnswer}
Key points: ${question.keyPoints.join('; ')}
Evidence quote: ${question.evidenceQuote}
Selected MCQ option: ${selectedChoice ? `${selectedChoice.id}. ${selectedChoice.text}` : 'not applicable'}
Correct MCQ option: ${correctChoice ? `${correctChoice.id}. ${correctChoice.text}` : 'not applicable'}
Student answer: ${answer.userAnswer ?? selectedChoice?.text ?? answer.selectedChoiceId ?? ''}
Local MCQ correctness: ${isMcq ? String(answer.selectedChoiceId === question.correctChoiceId) : 'not applicable'}`, source)

  return normalizeEvaluationResponse(
    parseGeminiJson(
      response.text,
      '{"score":0,"feedback":"","sourceReminder":"","missingKeyPoints":[]}',
      'verify-script evaluate-answer',
    ),
    'verify-script evaluate-answer',
  )
}

function assertQuizStructure(response, label) {
  assert(Array.isArray(response.questions), `${label}: questions must be an array.`)
  const actualMcq = countQuestions(response, 'mcq')
  const actualShort = countQuestions(response, 'short_essay')
  assert(actualMcq === REQUIRED_MCQ, `${label}: expected ${REQUIRED_MCQ} MCQs, got ${actualMcq}.`)
  assert(
    actualShort === REQUIRED_SHORT,
    `${label}: expected ${REQUIRED_SHORT} short essays, got ${actualShort}.`,
  )

  response.questions.forEach((question, index) => {
    const prefix = `${label}: question ${index + 1}`
    assertNonEmptyString(question.id, `${prefix} id`)
    assert(question.type === 'mcq' || question.type === 'short_essay', `${prefix} type`)
    assertNonEmptyString(question.topic, `${prefix} topic`)
    assertNonEmptyString(question.prompt, `${prefix} prompt`)
    assertNonEmptyString(question.expectedAnswer, `${prefix} expectedAnswer`)
    assert(Array.isArray(question.keyPoints), `${prefix} keyPoints must be an array.`)
    assertNonEmptyString(question.explanation, `${prefix} explanation`)
    assertNonEmptyString(question.evidenceQuote, `${prefix} evidenceQuote`)
    assert(['strong', 'partial', 'weak'].includes(question.groundingConfidence), `${prefix} confidence`)

    if (question.type === 'mcq') {
      assert(question.choices.length === CHOICE_COUNT, `${prefix} must have ${CHOICE_COUNT} choices.`)
      assertNonEmptyString(question.correctChoiceId, `${prefix} correctChoiceId`)
      const correctChoice = question.choices.find((choice) => choice.id === question.correctChoiceId)
      assert(Boolean(correctChoice), `${prefix} correctChoiceId must match a choice.`)
      assert(
        normalizeAnswer(correctChoice.text) === normalizeAnswer(question.expectedAnswer),
        `${prefix} expectedAnswer must match correct choice text.`,
      )
    }
  })
}

function assertVerificationStructure(response, questions, label) {
  assert(Array.isArray(response.results), `${label}: verification results must be an array.`)
  assert(response.results.length === questions.length, `${label}: verification must return one result per question.`)
  const questionIds = new Set(questions.map((question) => question.id))

  response.results.forEach((result, index) => {
    const prefix = `${label}: verification result ${index + 1}`
    assert(questionIds.has(result.questionId), `${prefix} questionId must match generated question.`)
    assert(result.verdict === 'accepted' || result.verdict === 'rejected', `${prefix} verdict`)
    assertNonEmptyString(result.reason, `${prefix} reason`)
    assertNonEmptyString(result.supportedAnswer, `${prefix} supportedAnswer`)
    assertNonEmptyString(result.sourceQuote, `${prefix} sourceQuote`)
  })
}

function assertEvaluationStructure(response, label) {
  assert(typeof response.score === 'number' && response.score >= 0 && response.score <= 5, `${label}: score`)
  assertNonEmptyString(response.feedback, `${label}: feedback`)
  assertNonEmptyString(response.sourceReminder, `${label}: sourceReminder`)
  assert(Array.isArray(response.missingKeyPoints), `${label}: missingKeyPoints must be an array.`)
}

function countQuestions(response, type) {
  return response.questions.filter((question) => question.type === type).length
}

function assertNonEmptyString(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string.`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function normalizeAnswer(value) {
  return String(value).trim().replace(/\s+/g, ' ').replace(/[.。]+$/u, '').toLowerCase()
}

function printPathResult(result) {
  console.log(`${result.label} (${result.model}): ${result.generated}; ${result.verification}; ${result.evaluations}.`)
  if (result.warnings.length) {
    console.log(`${result.label} warnings: ${result.warnings.join(' ')}`)
  }
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

async function loadRootPdfSource() {
  const fileName = 'Gastrointestinal Pathology ..pdf'
  const data = await readFile(resolve(process.cwd(), fileName))

  return {
    fileName,
    mimeType: 'application/pdf',
    base64: data.toString('base64'),
  }
}
