import { openDB, type DBSchema } from 'idb'
import type { AnswerAttempt, Question, QuizSession, StudyResource } from './types'

interface PhysioStudyDb extends DBSchema {
  resources: {
    key: string
    value: StudyResource
    indexes: { 'by-created': string }
  }
  sessions: {
    key: string
    value: QuizSession
    indexes: { 'by-resource': string }
  }
  questions: {
    key: string
    value: Question
    indexes: { 'by-session': string; 'by-resource': string }
  }
  attempts: {
    key: string
    value: AnswerAttempt
    indexes: { 'by-session': string; 'by-question': string }
  }
}

const DB_NAME = 'physio-study-db'
const DB_VERSION = 1

export const dbPromise = openDB<PhysioStudyDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const resources = db.createObjectStore('resources', { keyPath: 'id' })
    resources.createIndex('by-created', 'createdAt')

    const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
    sessions.createIndex('by-resource', 'resourceId')

    const questions = db.createObjectStore('questions', { keyPath: 'id' })
    questions.createIndex('by-session', 'sessionId')
    questions.createIndex('by-resource', 'resourceId')

    const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
    attempts.createIndex('by-session', 'sessionId')
    attempts.createIndex('by-question', 'questionId')
  },
})

export async function saveResource(resource: StudyResource) {
  const db = await dbPromise
  await db.put('resources', resource)
}

export async function getResources() {
  const db = await dbPromise
  const resources = await db.getAllFromIndex('resources', 'by-created')
  return resources.reverse()
}

export async function getResource(id: string) {
  const db = await dbPromise
  return db.get('resources', id)
}

export async function saveSession(session: QuizSession) {
  const db = await dbPromise
  await db.put('sessions', session)
}

export async function getSession(id: string) {
  const db = await dbPromise
  return db.get('sessions', id)
}

export async function getSessionsForResource(resourceId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('sessions', 'by-resource', resourceId)
}

export async function saveQuestions(questions: Question[]) {
  const db = await dbPromise
  const tx = db.transaction('questions', 'readwrite')
  await Promise.all((Array.isArray(questions) ? questions : []).map((question) => tx.store.put(question)))
  await tx.done
}

export async function getQuestionsForSession(sessionId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('questions', 'by-session', sessionId)
}

export async function getQuestionsForResource(resourceId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('questions', 'by-resource', resourceId)
}

export async function saveAttempt(attempt: AnswerAttempt) {
  const db = await dbPromise
  await db.put('attempts', attempt)
}

export async function getAttemptsForSession(sessionId: string) {
  const db = await dbPromise
  return db.getAllFromIndex('attempts', 'by-session', sessionId)
}

export async function deleteResourceCascade(resourceId: string) {
  const db = await dbPromise
  const tx = db.transaction(['resources', 'sessions', 'questions', 'attempts'], 'readwrite')

  const sessions = await tx.objectStore('sessions').index('by-resource').getAll(resourceId)
  const questions = await tx.objectStore('questions').index('by-resource').getAll(resourceId)

  await tx.objectStore('resources').delete(resourceId)
  await Promise.all((Array.isArray(sessions) ? sessions : []).map((session) => tx.objectStore('sessions').delete(session.id)))
  await Promise.all((Array.isArray(questions) ? questions : []).map((question) => tx.objectStore('questions').delete(question.id)))

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const attempts = await tx.objectStore('attempts').index('by-session').getAll(session.id)
    await Promise.all((Array.isArray(attempts) ? attempts : []).map((attempt) => tx.objectStore('attempts').delete(attempt.id)))
  }

  await tx.done
}

export async function clearAllLocalData() {
  const db = await dbPromise
  const tx = db.transaction(['resources', 'sessions', 'questions', 'attempts'], 'readwrite')

  await Promise.all([
    tx.objectStore('attempts').clear(),
    tx.objectStore('questions').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('resources').clear(),
  ])

  await tx.done
}
