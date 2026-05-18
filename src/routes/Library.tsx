import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteResourceCascade, getAttemptsForSession, getQuestionsForSession, getResources, getSessionsForResource } from '../lib/db'
import { getSessionProgress } from '../lib/session'
import type { QuizSession, StudyResource } from '../lib/types'

interface LibraryItem {
  resource: StudyResource
  sessions: Array<QuizSession & {
    progress: ReturnType<typeof getSessionProgress>
  }>
}

export function Library() {
  const [items, setItems] = useState<LibraryItem[]>([])

  async function loadLibrary() {
    const resources = await getResources()
    const withSessions = await Promise.all(
      (Array.isArray(resources) ? resources : []).map(async (resource) => {
        const sessions = (await getSessionsForResource(resource.id))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const sessionsWithProgress = await Promise.all(
          sessions.map(async (session) => ({
            ...session,
            progress: getSessionProgress(
              await getQuestionsForSession(session.id),
              await getAttemptsForSession(session.id),
            ),
          })),
        )

        return {
          resource,
          sessions: [
            ...sessionsWithProgress.filter((session) => !session.progress.isComplete),
            ...sessionsWithProgress.filter((session) => session.progress.isComplete),
          ],
        }
      }),
    )
    setItems(withSessions)
  }

  useEffect(() => {
    void loadLibrary()
  }, [])

  async function removeResource(resource: StudyResource) {
    const ok = window.confirm(`Remove "${resource.title}" and all its practice rounds from this device?`)
    if (!ok) return

    await deleteResourceCascade(resource.id)
    await loadLibrary()
  }

  return (
    <main className="page-grid">
      <section>
        <p className="eyebrow">Study library</p>
        <h1>Your clinical desk, ready for practice.</h1>
        <p>Keep lecture PDFs here, continue unfinished rounds, or start a fresh source-backed quiz when you sit down to revise.</p>
      </section>

      <div className="resource-grid">
        <Link className="add-card" to="/upload">
          <span className="plus" aria-hidden="true">+</span>
          <span className="add-card-copy">
            <strong>Add a new note</strong>
            <span>Upload a PDF lecture note, then make MCQs and short answers from it.</span>
          </span>
          <span className="add-card-hint">Saved on this device</span>
        </Link>
        {(Array.isArray(items) ? items : []).map(({ resource, sessions }) => (
          <article className="resource-card" key={resource.id}>
            <div>
              <p className="eyebrow">{resource.indexStatus === 'ready' ? 'saved PDF' : resource.indexStatus}</p>
              <h2>{resource.title}</h2>
              <p>{resource.fileName}</p>
            </div>
            <div className="card-meta">
              <span>{Math.round(resource.size / 1024)} KB</span>
              <span>{sessions.length} {sessions.length === 1 ? 'round' : 'rounds'}</span>
            </div>
            <div className="card-actions">
              {sessions[0] && (
                <>
                  {sessions[0].progress.isComplete ? (
                    <button className="button ghost" type="button" disabled>
                      {sessions[0].progress.total === 0 ? 'No questions' : 'Completed'}
                    </button>
                  ) : (
                    <Link className="button ghost" to={`/practice/${sessions[0].id}`}>
                      Continue · {sessions[0].progress.completed}/{sessions[0].progress.total}
                    </Link>
                  )}
                  <Link className="button ghost" to={`/review/${sessions[0].id}`}>Review</Link>
                </>
              )}
              <Link className="button primary" to={`/upload?resource=${resource.id}`}>New round</Link>
              <button className="button danger" type="button" onClick={() => void removeResource(resource)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
