import { minimaxText, type MiniMaxMessage, type MiniMaxTool } from './_minimax'
import type { PreparedSourceDocument } from './_document'
import {
  normalizeEvaluationResponse,
  normalizeQuizResponse,
  normalizeVerificationResponse,
  type NormalizedEvaluationResponse,
  type NormalizedQuizResponse,
  type NormalizedVerificationResponse,
} from './_studySchemas'

export function buildQuizPrompt(args: {
  source: PreparedSourceDocument
  requestedMcq: number
  requestedShort: number
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}) {
  const mcqCandidates = args.requestedMcq > 0 ? args.requestedMcq + 2 : 0
  const shortCandidates = args.requestedShort > 0 ? args.requestedShort + 1 : 0
  const priorQuestions = args.previousQuestions?.length
    ? `\nAvoid repeating these previous questions:\n${args.previousQuestions
        .slice(0, 40)
        .map((question, index) => `${index + 1}. [${question.topic}] ${question.prompt}`)
        .join('\n')}\n`
    : ''

  return `Create a physiotherapy revision quiz using only SOURCE_TEXT.

Rules:
- Read the whole SOURCE_TEXT before writing questions.
- Generate ${mcqCandidates} MCQ candidates and ${shortCandidates} short essay candidates.
- Each MCQ must have exactly ${args.choiceCount} choices with ids ${args.choiceCount === 4 ? 'A, B, C, D' : 'A, B, C, D, E'}.
- Each MCQ must have exactly one correct choice in correctChoiceId.
- expectedAnswer must exactly match the correct option text.
- Every answer must include evidenceQuote copied from SOURCE_TEXT or visual page notes.
- Include pageNumber whenever possible.
- Do not use outside medical knowledge.
- Return the result by calling the submit_quiz tool only.
${priorQuestions}
SOURCE_TITLE: ${args.source.fileName}

SOURCE_TEXT:
${args.source.fullText}`
}

export async function generateMiniMaxQuiz(args: {
  source: PreparedSourceDocument
  requestedMcq: number
  requestedShort: number
  choiceCount: 4 | 5
  previousQuestions?: Array<{ prompt: string; topic: string }>
}): Promise<NormalizedQuizResponse> {
  const content = await minimaxText({
    messages: [
      systemMessage(),
      { role: 'user', content: buildQuizPrompt(args) },
    ],
    maxTokens: 8192,
    tools: [quizTool],
    toolName: 'submit_quiz',
  })

  return normalizeQuizResponse(JSON.parse(content), 'generate-quiz')
}

export async function verifyMiniMaxQuestion(args: {
  source: PreparedSourceDocument
  question: unknown
}): Promise<NormalizedVerificationResponse> {
  return verifyMiniMaxQuestions({ source: args.source, questions: [args.question] })
}

export async function verifyMiniMaxQuestions(args: {
  source: PreparedSourceDocument
  questions: unknown[]
}): Promise<NormalizedVerificationResponse> {
  const content = await minimaxText({
    messages: [
      systemMessage(),
      {
        role: 'user',
        content: `Verify all QUESTIONS against SOURCE_TEXT. For each reject if: answer unsupported, evidence quote missing, outside knowledge required, or MCQ expectedAnswer mismatches the correctChoiceId option text. Return one result per question. Call submit_verification.\n\nQUESTIONS:\n${JSON.stringify(args.questions)}\n\nSOURCE_TEXT:\n${args.source.fullText}`,
      },
    ],
    maxTokens: 4096,
    tools: [verificationTool],
    toolName: 'submit_verification',
  })

  return normalizeVerificationResponse(JSON.parse(content), 'verify-quiz')
}

export async function evaluateMiniMaxEssay(args: {
  source: PreparedSourceDocument
  question: {
    prompt: string
    expectedAnswer: string
    keyPoints: string[]
    evidenceQuote: string
  }
  userAnswer?: string
  skipped?: boolean
}): Promise<NormalizedEvaluationResponse> {
  const content = await minimaxText({
    messages: [
      systemMessage(),
      {
        role: 'user',
        content: buildEvaluationPrompt(args),
      },
    ],
    maxTokens: 2048,
    tools: [evaluationTool],
    toolName: 'submit_evaluation',
  })

  return normalizeEvaluationResponse(JSON.parse(content), 'evaluate-answer')
}

export function buildEvaluationPrompt(args: {
  source: PreparedSourceDocument
  question: {
    prompt: string
    expectedAnswer: string
    keyPoints: string[]
    evidenceQuote: string
  }
  userAnswer?: string
  skipped?: boolean
}) {
  return `Evaluate this short essay using only SOURCE_TEXT, expected answer, key points, and evidence quote.

Rubric:
- Score 5: all key points are covered with source-supported meaning.
- Score 4: mostly correct with only minor imprecision or omission.
- Score 3: partially correct but misses an important key point.
- Score 1-2: limited relevant understanding.
- Score 0: skipped, blank, unrelated, contradicts SOURCE_TEXT, or relies on unsupported outside facts.
- isCorrect must be true only when score is 4 or 5.
- Missing key points must come only from the provided keyPoints list.

Grading rules:
- Do not require exact wording from EXPECTED_ANSWER or SOURCE_TEXT.
- Credit synonyms, paraphrases, reordered explanations, and concise answers when they preserve the same source-supported meaning.
- Be strict about missing meaning, contradictions, invented facts, and vague answers that do not match a key point.
- Feedback must be useful for a physiotherapy student and should distinguish wording problems from meaning problems.
- For correct answers, WHY must explain how the student can improve the answer for university marking: add missing morphology, sequence, percentages, terminology, or source-specific detail.
- For wrong answers, WHY must explain why the answer is wrong: missing key points, contradiction, unsupported outside fact, or not enough source-specific detail.
- If the answer is nonsense or unrelated, say that it does not address the question and list the first source-backed key points the student should have mentioned.
- Never leave WHY empty. If there is nothing wrong, give one concrete improvement.
- YOUR_ANSWER must quote or closely paraphrase what the student actually wrote; do not omit it.
- CORRECT_ANSWER must be a compact source-grounded model answer, not just the evidence quote.
- Return feedback using this structure exactly:
RESULT: Correct or Wrong

YOUR_ANSWER: brief summary of the student's answer

CORRECT_ANSWER: source-grounded answer in study-note language

WHY: concise explanation of score, missing key points, and source support

If SKIPPED is true, score 0 and explain only that the student skipped it. Call submit_evaluation only.

QUESTION: ${args.question.prompt}
EXPECTED_ANSWER: ${args.question.expectedAnswer}
KEY_POINTS: ${args.question.keyPoints.join('; ')}
EVIDENCE_QUOTE: ${args.question.evidenceQuote}
SKIPPED: ${String(args.skipped ?? false)}
STUDENT_ANSWER: ${args.userAnswer ?? ''}

SOURCE_TEXT:
${args.source.fullText}`
}

function systemMessage(): MiniMaxMessage {
  return {
    role: 'system',
    content: 'You are a strictly grounded physiotherapy study assistant. Use only the provided source text. Do not infer outside medical facts. Always use the requested tool for structured output.',
  }
}

export const quizTool: MiniMaxTool = {
  type: 'function',
  function: {
    name: 'submit_quiz',
    description: 'Submit the source-grounded quiz.',
    parameters: {
      type: 'object',
      properties: {
        resourceTitle: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: questionProperties(),
            required: ['id', 'type', 'topic', 'prompt', 'choices', 'correctChoiceId', 'expectedAnswer', 'keyPoints', 'explanation', 'evidenceQuote', 'groundingConfidence'],
          },
        },
      },
      required: ['resourceTitle', 'questions'],
    },
  },
}

export const verificationTool: MiniMaxTool = {
  type: 'function',
  function: {
    name: 'submit_verification',
    description: 'Submit verification results.',
    parameters: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'string' },
              verdict: { type: 'string', enum: ['accepted', 'rejected'] },
              reason: { type: 'string' },
              supportedAnswer: { type: 'string' },
              sourceQuote: { type: 'string' },
              fixSuggestion: { type: 'string' },
            },
            required: ['questionId', 'verdict', 'reason', 'supportedAnswer', 'sourceQuote'],
          },
        },
      },
      required: ['results'],
    },
  },
}

export const evaluationTool: MiniMaxTool = {
  type: 'function',
  function: {
    name: 'submit_evaluation',
    description: 'Submit essay evaluation.',
    parameters: {
      type: 'object',
      properties: {
        isCorrect: { type: 'boolean' },
        score: { type: 'number' },
        feedback: { type: 'string' },
        sourceReminder: { type: 'string' },
        missingKeyPoints: { type: 'array', items: { type: 'string' } },
      },
      required: ['score', 'feedback', 'sourceReminder', 'missingKeyPoints'],
    },
  },
}

function questionProperties() {
  return {
    id: { type: 'string' },
    type: { type: 'string', enum: ['mcq', 'short_essay'] },
    topic: { type: 'string' },
    prompt: { type: 'string' },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
          text: { type: 'string' },
        },
        required: ['id', 'text'],
      },
    },
    correctChoiceId: { type: 'string' },
    expectedAnswer: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
    evidenceQuote: { type: 'string' },
    sourceTitle: { type: 'string' },
    pageNumber: { type: 'number' },
    groundingConfidence: { type: 'string', enum: ['strong', 'partial', 'weak'] },
  }
}
