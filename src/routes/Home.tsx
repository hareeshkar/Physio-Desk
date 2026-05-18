import { Link } from 'react-router-dom'

export function Home() {
  return (
    <main className="home-shell">
      <section className="hero-card">
        <p className="eyebrow">For one focused physio student</p>
        <h1>Source-true revision, without the exam panic.</h1>
        <p>
          Upload a lecture note or PDF to generate 10 MCQs and 5 short essays, grounded
          entirely in your own source material.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/upload">Start a study set</Link>
          <Link className="button ghost" to="/library">Open library</Link>
        </div>
      </section>

      <section className="promise-grid">
        <article>
          <span className="num">01</span>
          <div className="body">
            <h2>Only your source</h2>
            <p>MiniMax anchors every question and answer with a quote from your note.</p>
          </div>
        </article>
        <article>
          <span className="num">02</span>
          <div className="body">
            <h2>Exam shaped</h2>
            <p>A/B/C/D MCQs by default, A–E when you need five choices.</p>
          </div>
        </article>
        <article>
          <span className="num">03</span>
          <div className="body">
            <h2>Stays on device</h2>
            <p>Questions, attempts, and PDFs are saved locally for whenever you revise.</p>
          </div>
        </article>
      </section>
    </main>
  )
}
