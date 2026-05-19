import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { generateQuizWithFullCoverage, verifyQuizInBatches } from '../lib/studyGeneration'
import {
  getQuestionsForResource,
  getResource,
  saveQuestions,
  saveResource,
  saveSession,
} from '../lib/db'
import {
  ensurePreparedSourceForFile,
  mergePreparedSourceFromResponse,
  toPreparedSourcePayload,
} from '../lib/preparedSource'
import {
  hasExactQuestionCounts,
  missingQuestionCounts,
  selectQuestionsForSession,
} from '../lib/questionSelection'
import { dedupeStrings } from '../lib/sourceCoverage'
import {
  DEFAULT_QUIZ_MODE_ID,
  formatQuestionMix,
  getQuizMode,
  normalizeQuestionCounts,
  QUIZ_MODES,
  resolveModeDisplayCounts,
  type QuizModeId,
} from '../lib/quizModes'
import { filterUsableQuestions } from '../lib/validation'
import type { PreparedSource, Question, QuizSession, StudyResource } from '../lib/types'

export function Upload() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [savedResource, setSavedResource] = useState<StudyResource | null>(null)
  const [mode, setMode] = useState<QuizModeId>(DEFAULT_QUIZ_MODE_ID)
  const [customMcq, setCustomMcq] = useState(6)
  const [customShortEssay, setCustomShortEssay] = useState(3)
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4)
  const [status, setStatus] = useState(() => idleStatusMessage(DEFAULT_QUIZ_MODE_ID, { mcq: 6, shortEssay: 3 }))
  const [steps, setSteps] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const customCounts = { mcq: customMcq, shortEssay: customShortEssay }
  const previewCounts = resolveModeDisplayCounts(mode, customCounts)

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

  useEffect(() => {
    if (busy) return
    setStatus(idleStatusMessage(mode, customCounts))
  }, [mode, customMcq, customShortEssay, busy])

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

      logStep('Reading PDF text on this device…')
      const prepared = await ensurePreparedSourceForFile(file, resource)
      resource = prepared.resource
      const studySource = toPreparedSourcePayload(prepared.preparedSource)
      await saveResource(resource)
      setSavedResource(resource)

      for (const warning of dedupeStrings(prepared.preparedSource.warnings ?? [])) {
        logStep(warning)
      }

      const previousQuestions = await getQuestionsForResource(resource.id)
      const generated = await generateQuizWithFullCoverage({
        preparedSource: studySource,
        mode,
        counts: selectedCounts,
        choiceCount,
        previousQuestions: previousQuestions.map((q) => ({ prompt: q.prompt, topic: q.topic })),
        onProgress: logStep,
      })

      resource = mergePreparedSourceFromResponse(resource, generated.preparedSource)
      await saveResource(resource)
      setSavedResource(resource)

      logStep('Filtering weak or repeated questions…')
      for (const warning of dedupeStrings(generated.warnings ?? [])) {
        logStep(`Partial quiz response: ${warning}`)
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

      let verified = await verifyQuizInBatches({
        preparedSource: activePreparedSource(resource, studySource),
        questions: locallyValid,
        counts: selectedCounts,
        onProgress: logStep,
      })

      for (const warning of dedupeStrings(verified.warnings ?? [])) {
        logStep(`Partial verification response: ${warning}`)
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
        const missingCounts = missingQuestionCounts(selectedQuestions, selectedCounts)
        logStep('Asking MiniMax for replacement candidates…')
        const retryGenerated = await generateQuizWithFullCoverage({
          preparedSource: activePreparedSource(resource, studySource),
          mode,
          counts: missingCounts,
          choiceCount,
          previousQuestions: [
            ...previousQuestions,
            ...normalized,
          ].map((q) => ({ prompt: q.prompt, topic: q.topic })),
          onProgress: logStep,
        })

        resource = mergePreparedSourceFromResponse(resource, retryGenerated.preparedSource)
        await saveResource(resource)
        setSavedResource(resource)

        const retryNormalized = retryGenerated.questions.map((q): Question => ({
          ...q,
          id: q.id || crypto.randomUUID(),
          sessionId,
          resourceId: resource.id,
          verificationStatus: 'pending',
        }))
        const retryValid = filterUsableQuestions(retryNormalized, choiceCount).accepted
        verified = await verifyQuizInBatches({
          preparedSource: activePreparedSource(resource, studySource),
          questions: retryValid,
          counts: missingCounts,
          onProgress: logStep,
        })
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
            onChange={(e) => {
              const nextFile = e.target.files?.[0] ?? null
              setFile(nextFile)
              if (nextFile && savedResource) {
                setSavedResource({
                  ...savedResource,
                  preparedSource: undefined,
                  preparedSourceExtractedAt: undefined,
                })
              }
            }}
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
          {QUIZ_MODES.map((quizMode) => {
            const displayCounts = resolveModeDisplayCounts(quizMode.id, customCounts)
            return (
              <button
                className={mode === quizMode.id ? 'mode active' : 'mode'}
                key={quizMode.id}
                onClick={() => setMode(quizMode.id)}
                type="button"
              >
                <strong>{quizMode.label}</strong>
                <small>
                  {quizMode.id === 'custom'
                    ? formatQuestionMix(displayCounts)
                    : `${displayCounts.mcq} MCQ${displayCounts.mcq === 1 ? '' : 's'} + ${displayCounts.shortEssay} short essay${displayCounts.shortEssay === 1 ? '' : 's'}`}
                </small>
                <span>{quizMode.description}</span>
              </button>
            )
          })}
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
          {busy ? 'Preparing your practice…' : `Generate ${formatQuestionMix(previewCounts)}`}
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

function activePreparedSource(resource: StudyResource, fallback: PreparedSource) {
  return toPreparedSourcePayload(resource.preparedSource ?? fallback)
}

function idleStatusMessage(modeId: QuizModeId, customCounts: { mcq: number; shortEssay: number }) {
  const counts = resolveModeDisplayCounts(modeId, customCounts)
  return `Choose a document to generate ${formatQuestionMix(counts)}.`
}
