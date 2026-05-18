import { NavLink, Route, Routes } from 'react-router-dom'
import { Home } from './routes/Home'
import { Library } from './routes/Library'
import { Practice } from './routes/Practice'
import { Review } from './routes/Review'
import { Settings } from './routes/Settings'
import { Upload } from './routes/Upload'

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/">Physio Desk</NavLink>
        <nav className="top-nav">
          <NavLink to="/library">Library</NavLink>
          <NavLink to="/upload">Upload</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>

      <Routes>
        <Route element={<Home />} path="/" />
        <Route element={<Library />} path="/library" />
        <Route element={<Upload />} path="/upload" />
        <Route element={<Practice />} path="/practice/:sessionId" />
        <Route element={<Review />} path="/review/:sessionId" />
        <Route element={<Settings />} path="/settings" />
      </Routes>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavLink to="/library" className="tab">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>Library</span>
        </NavLink>

        <NavLink to="/upload" className="tab tab-center" aria-label="Upload">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </NavLink>

        <NavLink to="/settings" className="tab">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  )
}

export default App
