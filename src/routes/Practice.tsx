import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAttemptsForSession, getQuestionsForSession, getSession, saveAttempt } from '../lib/db'
import { buildFeedbackSections } from '../lib/feedbackFormat'
import { buildLocalMcqFeedback, toChoiceId } from '../lib/mcqFeedback'
import {
  buildPendingEssayAttempt,
  buildSkippedAttempt,
  getPracticeDestinationAfterAttempt,
  getFirstUnansweredQuestionIndex,
  orderQuestionsForSession,
} from '../lib/session'
import type { AnswerAttempt, EvaluationResult, Question, QuizSession } from '../lib/types'

export function Practice() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>()
  const [essay, setEssay] = useState('')
  const [feedback, setFeedback] = useState<EvaluationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const question = questions[index]

  useEffect(() => {
    async function load() {
      const loadedSession = await getSession(sessionId)
      if (!loadedSession) return
      const loadedQuestions = orderQuestionsForSession(
        loadedSession,
        await getQuestionsForSession(sessionId),
      )
      const loadedAttempts = await getAttemptsForSession(sessionId)
      setSession(loadedSession)
      setQuestions(loadedQuestions)
      setIndex(getFirstUnansweredQuestionIndex(loadedQuestions, loadedAttempts))
    }
    void load()
  }, [sessionId])

  const progress = useMemo(
    () => (questions.length ? Math.round(((index + 1) / questions.length) * 100) : 0),
    [index, questions.length],
  )

  const canSubmit =
    question?.type === 'mcq' ? Boolean(selectedChoiceId) : essay.trim().length > 0

  async function moveToNextUnfinished(attemptsOverride?: AnswerAttempt[]) {
    const latestAttempts = attemptsOverride ?? await getAttemptsForSession(sessionId)
    const destination = getPracticeDestinationAfterAttempt(questions, latestAttempts, index, sessionId)

    setError(null)
    setFeedback(null)
    setSelectedChoiceId(undefined)
    setEssay('')

    if (destination.kind === 'review') {
      navigate(destination.to)
      return
    }

    setIndex(destination.index)
  }

  async function submitAnswer() {
    if (!question) return
    setBusy(true)
    setError(null)
    try {
      const attempt = question.type === 'mcq'
        ? buildMcqAttempt(question, sessionId, selectedChoiceId)
        : buildPendingEssayAttempt({
            id: crypto.randomUUID(),
            sessionId,
            question,
            userAnswer: essay.trim(),
            createdAt: new Date().toISOString(),
          })
      await saveAttempt(attempt)
      const latestAttempts = await getAttemptsForSession(sessionId)

      if (question.type === 'mcq') {
        const result = {
          isCorrect: attempt.isCorrect,
          score: attempt.score ?? 0,
          feedback: attempt.feedback,
          sourceReminder: attempt.sourceReminder,
          missingKeyPoints: attempt.isCorrect ? [] : question.keyPoints,
        }
        const destination = getPracticeDestinationAfterAttempt(questions, latestAttempts, index, sessionId)
        if (destination.kind === 'review') {
          navigate(destination.to)
          return
        }
        setFeedback(result)
      } else {
        await moveToNextUnfinished(latestAttempts)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this answer. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function skipQuestion() {
    if (!question) return
    setBusy(true)
    setError(null)
    try {
      const attempt = buildSkippedAttempt({
        id: crypto.randomUUID(),
        sessionId,
        question,
        createdAt: new Date().toISOString(),
      })
      await saveAttempt(attempt)
      await moveToNextUnfinished(await getAttemptsForSession(sessionId))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save this skip. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function nextQuestion() {
    await moveToNextUnfinished()
  }

  if (!session || !question) {
    return (
      <main className="page-grid">
        <p>Loading practice round…</p>
      </main>
    )
  }

  return (
    <main className="practice-shell">
      <div className="progress-top">
        <span>{index + 1} / {questions.length}</span>
        <Link to={`/review/${session.id}`}>Review</Link>
      </div>
      <div className="progress-rail">
        <div className="progress-rail-fill" style={{ width: `${progress}%` }} />
      </div>

      <section className="quiz-card">
        <p className="eyebrow">{question.topic}</p>
        <p className="question-prompt">{question.prompt}</p>

        {question.type === 'mcq' ? (
          <div className="answers-grid" aria-label="Answer options">
            {Array.isArray(question.choices) && question.choices.length > 0 ? (
              question.choices.map((choice) => (
                <button
                  className={selectedChoiceId === choice.id ? 'answer selected' : 'answer'}
                  key={choice.id}
                  onClick={() => setSelectedChoiceId(choice.id)}
                  type="button"
                >
                  <span>{choice.id}</span>
                  <strong>{choice.text}</strong>
                </button>
              ))
            ) : (
              <p>This MCQ is missing choices. Generate a fresh practice round for this note.</p>
            )}
          </div>
        ) : (
          <textarea
            className="essay-box"
            placeholder="Write your answer as your university would expect it…"
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
          />
        )}

        {!feedback ? (
          <div className="practice-actions">
            <button className="button ghost" disabled={busy} onClick={skipQuestion} type="button">
              Skip for now
            </button>
            <button className="button primary" disabled={busy || !canSubmit} onClick={submitAnswer}>
              {busy
                ? question.type === 'mcq' ? 'Checking…' : 'Checking against your note…'
                : question.type === 'mcq' ? 'Submit answer' : 'Submit essay'}
            </button>
          </div>
        ) : (
          <FeedbackPanel
            feedback={feedback}
            question={question}
            onNext={nextQuestion}
            isLast={index === questions.length - 1}
            sessionId={session.id}
          />
        )}

        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  )
}

function buildMcqAttempt(question: Question, sessionId: string, selectedChoiceId?: string): AnswerAttempt {
  const result = buildLocalMcqFeedback(question, selectedChoiceId)

  return {
    id: crypto.randomUUID(),
    sessionId,
    questionId: question.id,
    createdAt: new Date().toISOString(),
    selectedChoiceId: toChoiceId(selectedChoiceId),
    isCorrect: result.isCorrect,
    score: result.score,
    feedback: result.feedback,
    sourceReminder: result.sourceReminder,
    evaluationStatus: 'evaluated',
  }
}

function FeedbackPanel({
  feedback,
  question,
  onNext,
  isLast,
  sessionId,
}: {
  feedback: EvaluationResult
  question: Question
  onNext: () => void | Promise<void>
  isLast: boolean
  sessionId: string
}) {
  const sections = buildFeedbackSections(feedback, question)

  return (
    <div className="feedback-panel">
      <div className={`result-banner ${sections.resultLabel.toLowerCase()}`}>
        <span>{sections.resultLabel}</span>
        <strong>{sections.resultHint}</strong>
      </div>

      {question.type === 'mcq' ? (
        <div className="feedback-stack">
          <div className="feedback-box subtle">
            <span>Your answer</span>
            <p>{sections.yourAnswer ?? 'Not recorded'}</p>
          </div>
          <div className="feedback-box correct-answer">
            <span>Correct answer</span>
            <p>{sections.correctAnswer ?? question.expectedAnswer}</p>
          </div>
          <div className="feedback-box">
            <span>Why</span>
            <p>{sections.why}</p>
          </div>
        </div>
      ) : (
        <>
          <h2>{question.expectedAnswer}</h2>
          <p>{feedback.feedback}</p>
        </>
      )}

      <div className="source-card">
        <span>Source from the note</span>
        <blockquote>{question.evidenceQuote}</blockquote>
      </div>
      {isLast ? (
        <Link className="button primary" to={`/review/${sessionId}`}>See review</Link>
      ) : (
        <button className="button primary" onClick={onNext} type="button">Next question</button>
      )}
    </div>
  )
}
