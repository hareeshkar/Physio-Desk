import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { generateQuiz, pdfSourceFromFile, verifyQuiz } from '../lib/api'
import {
  getQuestionsForResource,
  getResource,
  saveQuestions,
  saveResource,
  saveSession,
} from '../lib/db'
import { hasExactQuestionCounts, selectQuestionsForSession } from '../lib/questionSelection'
import { DEFAULT_QUIZ_MODE_ID, getQuizMode, normalizeQuestionCounts, QUIZ_MODES, type QuizModeId } from '../lib/quizModes'
import { filterUsableQuestions } from '../lib/validation'
import type { Question, QuizSession, StudyResource } from '../lib/types'

export function Upload() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [savedResource, setSavedResource] = useState<StudyResource | null>(null)
  const [mode, setMode] = useState<QuizModeId>(DEFAULT_QUIZ_MODE_ID)
  const [customMcq, setCustomMcq] = useState(6)
  const [customShortEssay, setCustomShortEssay] = useState(3)
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4)
  const [status, setStatus] = useState('Choose a document to generate 10 MCQs and 5 short essays.')
  const [steps, setSteps] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const previewCounts = mode === 'custom'
    ? safeQuestionCounts(customMcq, customShortEssay)
    : { mcq: getQuizMode(mode).mcq, shortEssay: getQuizMode(mode).shortEssay }

  function logStep(message: string) {
    console.log(`[Physio Study] ${message}`)
    setStatus(message)
    setSteps((current) => [...current, message])
  }

  useEffect(() => {
    async function loadSavedResource() {
      const resourceId = searchParams.get('resource')
      if (!resourceId) return

      const resource = await getResource(resourceId)
      if (!resource) {
        setStatus('That saved note was not found. Choose the file again.')
        return
      }

      setSavedResource(resource)
      setFile(new File([resource.fileBlob], resource.fileName, { type: resource.mimeType }))
      logStep('Saved note loaded. You can generate a new practice round without uploading again.')
    }

    void loadSavedResource()
  }, [searchParams])

  async function handleCreate() {
    if (!file) return

    setBusy(true)
    setSteps([])
    try {
      const resourceId = savedResource?.id ?? crypto.randomUUID()
      const sessionId = crypto.randomUUID()
      const selectedMode = getQuizMode(mode)
      const selectedCounts = normalizeQuestionCounts(
        mode === 'custom'
          ? { mcq: customMcq, shortEssay: customShortEssay }
          : { mcq: selectedMode.mcq, shortEssay: selectedMode.shortEssay },
      )
      const createdAt = savedResource?.createdAt ?? new Date().toISOString()

      let resource: StudyResource =
        savedResource ?? {
          id: resourceId,
          title: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          createdAt,
          fileBlob: file,
          indexStatus: 'ready',
        }

      logStep('Saving your note on this device…')
      resource = { ...resource, fileBlob: file, mimeType: 'application/pdf', indexStatus: 'ready' }
      await saveResource(resource)
      setSavedResource(resource)

      const previousQuestions = await getQuestionsForResource(resource.id)
      logStep('Extracting page-by-page source text…')
      const pdfSource = await pdfSourceFromFile(file)
      logStep('Sending to MiniMax for source-grounded questions…')
      const generated = await generateQuiz({
        pdfSource,
        mode,
        counts: selectedCounts,
        choiceCount,
        previousQuestions: previousQuestions.map((q) => ({ prompt: q.prompt, topic: q.topic })),
      })

      logStep('Filtering weak or repeated questions…')
      if (generated.warnings?.length) {
        logStep(`Partial quiz response: ${generated.warnings.join(' ')}`)
      }
      if (!Array.isArray(generated.questions)) {
        throw new Error('MiniMax returned an invalid quiz response: questions was not an array.')
      }

      const normalized = generated.questions.map((q): Question => ({
        ...q,
        id: q.id || crypto.randomUUID(),
        sessionId,
        resourceId: resource.id,
        verificationStatus: 'pending',
      }))
      const locallyValid = filterUsableQuestions(normalized, choiceCount).accepted

      logStep('Verifying every question against the full PDF…')
      let verified = await verifyQuiz({ pdfSource, questions: locallyValid })

      if (verified.warnings?.length) {
        logStep(`Partial verification response: ${verified.warnings.join(' ')}`)
      }
      if (!Array.isArray(verified.acceptedQuestions)) {
        throw new Error('MiniMax returned an invalid verification response: acceptedQuestions was not an array.')
      }

      let accepted = verified.acceptedQuestions.map((q) => ({
        ...q,
        sessionId,
        resourceId: resource.id,
        verificationStatus: 'accepted' as const,
      }))
      let selectedQuestions = selectQuestionsForSession(accepted, {
        mcq: selectedCounts.mcq,
        shortEssay: selectedCounts.shortEssay,
      })

      if (!hasExactQuestionCounts(selectedQuestions, {
        mcq: selectedCounts.mcq,
        shortEssay: selectedCounts.shortEssay,
      })) {
        logStep('Asking MiniMax for replacement candidates…')
        const retryGenerated = await generateQuiz({
          pdfSource,
          mode,
          counts: selectedCounts,
          choiceCount,
          previousQuestions: [
            ...previousQuestions,
            ...normalized,
          ].map((q) => ({ prompt: q.prompt, topic: q.topic })),
        })
        const retryNormalized = retryGenerated.questions.map((q): Question => ({
          ...q,
          id: q.id || crypto.randomUUID(),
          sessionId,
          resourceId: resource.id,
          verificationStatus: 'pending',
        }))
        const retryValid = filterUsableQuestions(retryNormalized, choiceCount).accepted
        verified = await verifyQuiz({ pdfSource, questions: retryValid })
        accepted = [
          ...accepted,
          ...verified.acceptedQuestions.map((q) => ({
            ...q,
            sessionId,
            resourceId: resource.id,
            verificationStatus: 'accepted' as const,
          })),
        ]
        selectedQuestions = selectQuestionsForSession(accepted, {
          mcq: selectedCounts.mcq,
          shortEssay: selectedCounts.shortEssay,
        })
      }

      if (!hasExactQuestionCounts(selectedQuestions, {
        mcq: selectedCounts.mcq,
        shortEssay: selectedCounts.shortEssay,
      })) {
        throw new Error('MiniMax could not create strongly grounded questions from this file yet.')
      }

      const session: QuizSession = {
        id: sessionId,
        resourceId: resource.id,
        createdAt,
        mode,
        choiceCount,
        questionIds: selectedQuestions.map((q) => q.id),
        status: 'active',
      }

      await saveSession(session)
      await saveQuestions(selectedQuestions)
      logStep('Practice round is ready.')
      navigate(`/practice/${sessionId}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page-grid">
      <section>
        <p className="eyebrow">Create a study set</p>
        <h1>Give me the note. I'll build the exam set.</h1>
        <p>Choose a preset or make a custom mix. Set either type to zero if she wants to skip it today.</p>
      </section>

      <section className="upload-card">
        <label className="file-drop">
          <input
            type="file"
            accept=".pdf,.txt,.md,.html,.doc,.docx,.ppt,.pptx,application/pdf,text/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span>
            {file
              ? savedResource
                ? `Using saved note: ${file.name}`
                : file.name
              : 'Tap to choose a lecture note or PDF'}
          </span>
        </label>

        <div className="mode-grid">
          {QUIZ_MODES.map((quizMode) => (
            <button
              className={mode === quizMode.id ? 'mode active' : 'mode'}
              key={quizMode.id}
              onClick={() => setMode(quizMode.id)}
              type="button"
            >
              <strong>{quizMode.label}</strong>
              <small>{quizMode.mcq} MCQ + {quizMode.shortEssay} short</small>
              <span>{quizMode.description}</span>
            </button>
          ))}
        </div>

        {mode === 'custom' && (
          <div className="custom-counts" aria-label="Custom question counts">
            <label>
              <span>MCQs</span>
              <input
                min="0"
                max="50"
                type="number"
                value={customMcq}
                onChange={(e) => setCustomMcq(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Short essays</span>
              <input
                min="0"
                max="30"
                type="number"
                value={customShortEssay}
                onChange={(e) => setCustomShortEssay(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <div className="choice-toggle">
          <span>MCQ choices: A/B/C/D{choiceCount === 5 ? '/E' : ''}</span>
          <button onClick={() => setChoiceCount(4)} className={choiceCount === 4 ? 'active' : ''} type="button">4</button>
          <button onClick={() => setChoiceCount(5)} className={choiceCount === 5 ? 'active' : ''} type="button">5</button>
        </div>

        <button className="button primary wide" disabled={!file || busy || previewCounts.mcq + previewCounts.shortEssay < 1} onClick={handleCreate}>
          {busy ? 'Preparing your practice…' : `Generate ${
            previewCounts.mcq
          } MCQs + ${
            previewCounts.shortEssay
          } essays`}
        </button>

        <p className="status-line">{status}</p>

        {steps.length > 0 && (
          <div className="progress-log" aria-live="polite">
            <strong>{busy ? 'Working…' : 'Latest steps'}</strong>
            {steps.map((step, i) => (
              <span key={`${step}-${i}`}>{step}</span>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function safeQuestionCounts(mcq: number, shortEssay: number) {
  try {
    return normalizeQuestionCounts({ mcq, shortEssay })
  } catch {
    return { mcq: 0, shortEssay: 0 }
  }
}
