export type QuestionType = 'mcq' | 'short_essay'

export type ChoiceId = 'A' | 'B' | 'C' | 'D' | 'E'

export interface Choice {
  id: ChoiceId
  text: string
}

export type ExtractionQuality = 'strong' | 'weak' | 'visual'

export interface PreparedSourcePage {
  pageNumber: number
  text: string
  extractionQuality: ExtractionQuality
  visualNotes?: string
}

export interface PreparedSourceStats {
  pageCount: number
  weakPageCount: number
  strongPageCount: number
  visualPageCount: number
}

export interface PreparedSource {
  fileName: string
  fullText: string
  pages?: PreparedSourcePage[]
  stats?: PreparedSourceStats
  warnings?: string[]
}

export interface StudyResource {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
  fileBlob: Blob
  preparedSource?: PreparedSource
  preparedSourceExtractedAt?: string
  fileSearchStoreName?: string
  documentName?: string
  indexStatus: 'local' | 'indexing' | 'ready' | 'failed'
  lastIndexedAt?: string
}

export interface Question {
  id: string
  sessionId: string
  resourceId: string
  type: QuestionType
  topic: string
  prompt: string
  choices?: Choice[]
  correctChoiceId?: ChoiceId
  expectedAnswer: string
  keyPoints: string[]
  explanation: string
  evidenceQuote: string
  sourceTitle?: string
  pageNumber?: number
  groundingConfidence: 'strong' | 'partial' | 'weak'
  verificationStatus: 'pending' | 'accepted' | 'rejected'
}

export interface QuizSession {
  id: string
  resourceId: string
  createdAt: string
  mode: 'quick' | 'exam' | 'custom'
  choiceCount: 4 | 5
  questionIds: string[]
  status: 'draft' | 'active' | 'completed'
  scoreSummary?: {
    correct: number
    total: number
    essayAverage: number
  }
}

export interface AnswerAttempt {
  id: string
  sessionId: string
  questionId: string
  createdAt: string
  selectedChoiceId?: ChoiceId
  userAnswer?: string
  isCorrect?: boolean
  score?: number
  feedback: string
  sourceReminder: string
  skipped?: boolean
  evaluationStatus?: 'pending' | 'evaluating' | 'evaluated' | 'failed' | 'skipped'
  missingKeyPoints?: string[]
  warnings?: string[]
  evaluationError?: string
  confidence?: 'knew' | 'unsure' | 'needs_revision'
}

export interface VerificationResult {
  questionId: string
  verdict: 'accepted' | 'rejected'
  reason: string
  supportedAnswer: string
  sourceQuote: string
  fixSuggestion?: string
}

export interface EvaluationResult {
  isCorrect?: boolean
  score: number
  feedback: string
  sourceReminder: string
  missingKeyPoints: string[]
  skipped?: boolean
  warnings?: string[]
}
