import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { evaluateAnswer } from '../lib/api'
import {
  buildFailedEssayEvaluationAttempt,
  buildRetryEssayEvaluationAttempt,
  evaluatePendingEssayAttempt,
  getPendingEssayEvaluations,
  isLatestAttempt,
} from '../lib/deferredEssayEvaluation'
import { getAttemptsForSession, getQuestionsForSession, getResource, getSession, saveAttempt, saveResource } from '../lib/db'
import { buildFeedbackSections } from '../lib/feedbackFormat'
import { ensurePreparedSourceForResource, toPreparedSourcePayload } from '../lib/preparedSource'
import { getLatestAttemptsByQuestion, getSessionProgress, getWeakTopics, orderQuestionsForSession } from '../lib/session'
import type { AnswerAttempt, Question, QuizSession } from '../lib/types'

export function Review() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [attempts, setAttempts] = useState<AnswerAttempt[]>([])
  const [evaluatingCount, setEvaluatingCount] = useState(0)
  const inFlightAttemptIds = useRef(new Set<string>())

  const orderedQuestions = useMemo(
    () => session ? orderQuestionsForSession(session, questions) : questions,
    [session, questions],
  )
  const latestByQuestion = getLatestAttemptsByQuestion(attempts)
  const latestAttempts = orderedQuestions
    .map((question) => latestByQuestion.get(question.id))
    .filter((attempt): attempt is AnswerAttempt => Boolean(attempt))
  const weakTopics = getWeakTopics(orderedQuestions, latestAttempts)
  const correct = latestAttempts.filter((a) => a.isCorrect).length
  const progress = getSessionProgress(orderedQuestions, attempts)

  useEffect(() => {
    async function load() {
      setSession(await getSession(sessionId) ?? null)
      setQuestions(await getQuestionsForSession(sessionId))
      setAttempts(await getAttemptsForSession(sessionId))
    }
    void load()
  }, [sessionId])

  useEffect(() => {
    if (!session || questions.length === 0) return
    const pending = getPendingEssayEvaluations(orderedQuestions, attempts)
      .filter((item) => !inFlightAttemptIds.current.has(item.attempt.id))
    if (pending.length === 0) return

    let cancelled = false

    async function evaluatePendingEssays() {
      if (!session) return
      setEvaluatingCount(pending.length)

      try {
        const resource = await getResource(session.resourceId)
        if (!resource) throw new Error('Saved PDF was not found on this device.')

        const preparedSource = await ensurePreparedSourceForResource(resource)
        if (!resource.preparedSource?.fullText) {
          await saveResource({
            ...resource,
            preparedSource,
            preparedSourceExtractedAt: new Date().toISOString(),
          })
        }

        const studySource = { preparedSource: toPreparedSourcePayload(preparedSource) }

        for (const item of pending) {
          inFlightAttemptIds.current.add(item.attempt.id)
          await evaluatePendingEssayAttempt({
            attempt: item.attempt,
            attempts: () => getAttemptsForSession(sessionId),
            evaluate: () => evaluateAnswer({
              ...studySource,
              question: item.question,
              userAnswer: item.attempt.userAnswer,
            }),
            save: saveAttempt,
            now: () => new Date().toISOString(),
          })

          if (!cancelled) {
            setAttempts(await getAttemptsForSession(sessionId))
            setEvaluatingCount((count) => Math.max(0, count - 1))
          }
          inFlightAttemptIds.current.delete(item.attempt.id)
        }
      } catch (error) {
        for (const item of pending) {
          const latestBeforeFailure = await getAttemptsForSession(sessionId)
          if (isLatestAttempt(item.attempt, latestBeforeFailure)) {
            await saveAttempt(buildFailedEssayEvaluationAttempt(item.attempt, error, new Date().toISOString()))
          }
        }
        if (!cancelled) {
          setAttempts(await getAttemptsForSession(sessionId))
          setEvaluatingCount(0)
        }
      }
    }

    void evaluatePendingEssays()

    return () => {
      cancelled = true
    }
  }, [attempts, orderedQuestions, questions.length, session?.id, session?.resourceId, sessionId])

  async function retryEssayEvaluation(attempt: AnswerAttempt) {
    await saveAttempt(buildRetryEssayEvaluationAttempt(attempt, new Date().toISOString()))
    setAttempts(await getAttemptsForSession(sessionId))
  }

  return (
    <main className="page-grid">
      <section className="review-hero">
        <p className="eyebrow">Revision summary</p>
        <h1>A small win for today.</h1>
        <p>Keep the source quotes close and the weak spots will soften.</p>
        {attempts.length > 0 && (
          <div className="score-pill">
            {correct} / {latestAttempts.length} correct
          </div>
        )}
      </section>

      <section className="review-grid">
        <article className="panel">
          <h2>Revise these</h2>
          {weakTopics.length === 0 ? (
            <p>No weak topics yet — finish more questions to build a pattern.</p>
          ) : (
            weakTopics.map((topic) => (
              <div className="topic-row" key={topic.topic}>
                <span>{topic.topic}</span>
                <strong>{topic.count}</strong>
              </div>
            ))
          )}
        </article>

        <article className="panel">
          <h2>Source-backed attempts</h2>
          {evaluatingCount > 0 && (
            <div className="inline-status" role="status">
              Checking {evaluatingCount} short {evaluatingCount === 1 ? 'answer' : 'answers'} against your note…
            </div>
          )}
          {latestAttempts.length === 0 ? (
            <p>No attempts yet — start practising to see feedback here.</p>
          ) : (
            latestAttempts.map((attempt) => {
              const q = questions.find((item) => item.id === attempt.questionId)
              const sections = buildFeedbackSections(attempt, q)
              return (
                <div className="attempt" key={attempt.id}>
                  <div className={`attempt-status ${sections.resultLabel.toLowerCase()}`}>
                    {sections.resultLabel}
                  </div>
                  <strong>{q?.prompt}</strong>
                  <div className="attempt-feedback-grid">
                    {sections.yourAnswer && (
                      <div className="mini-feedback">
                        <span>Your answer</span>
                        <p>{sections.yourAnswer}</p>
                      </div>
                    )}
                    {sections.correctAnswer && (
                      <div className="mini-feedback correct-answer">
                        <span>Correct answer</span>
                        <p>{sections.correctAnswer}</p>
                      </div>
                    )}
                    <div className="mini-feedback why">
                      <span>{sections.whyLabel}</span>
                      <p>{sections.why}</p>
                    </div>
                  </div>
                  <div className="source-card compact">
                    <span>Source</span>
                    <blockquote>{q?.evidenceQuote}</blockquote>
                  </div>
                  {q?.type === 'short_essay' && attempt.userAnswer?.trim() && attempt.evaluationStatus !== 'pending' && (
                    <button className="button ghost" type="button" onClick={() => void retryEssayEvaluation(attempt)}>
                      Retry checking this answer
                    </button>
                  )}
                </div>
              )
            })
          )}
        </article>
      </section>

      {session && !progress.isComplete && (
        <Link className="button ghost" to={`/practice/${session.id}`}>Continue unfinished questions</Link>
      )}
    </main>
  )
}
