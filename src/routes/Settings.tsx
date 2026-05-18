import { useState } from 'react'
import { clearAllLocalData } from '../lib/db'

export function Settings() {
  const [message, setMessage] = useState('')

  async function clearLocalData() {
    await clearAllLocalData()
    setMessage('Local study data cleared.')
  }

  return (
    <main className="page-grid">
      <section>
        <p className="eyebrow">Settings</p>
        <h1>Keep the desk tidy.</h1>
        <p>Your study files stay in this browser — nothing leaves the device.</p>
      </section>

      <section className="panel">
        <h2>Local privacy</h2>
        <p style={{ marginBottom: '16px' }}>
          Uploaded files, generated questions, and feedback are saved in IndexedDB on this
          device only. AI provider keys live in Netlify environment variables.
        </p>
        <div className="settings-row">
          <button className="button ghost" onClick={clearLocalData} type="button">
            Clear local study data
          </button>
          {message && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{message}</span>}
        </div>
      </section>
    </main>
  )
}
