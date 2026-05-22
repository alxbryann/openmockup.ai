import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Landing from './Landing.tsx'
import EmbedView from './EmbedView.tsx'
import './renderApi'  // Headless render API for Playwright automation

const MESH_BG = [
  'radial-gradient(60% 50% at 80% 10%, #ffd1f5 0%, transparent 60%)',
  'radial-gradient(50% 50% at 10% 30%, #c3e9ff 0%, transparent 55%)',
  'radial-gradient(70% 60% at 50% 100%, #d6ffe9 0%, transparent 60%)',
  'linear-gradient(180deg, #f4ecff 0%, #ffefe7 100%)',
].join(', ')

type Mode = 'landing' | 'studio' | 'embed'

function readMode(): { mode: Mode; projectId: string | null } {
  const q = new URLSearchParams(location.search)
  const projectId = q.get('project')
  if (q.has('embed') && projectId) return { mode: 'embed', projectId }
  if (q.has('studio')) return { mode: 'studio', projectId }
  return { mode: 'landing', projectId: null }
}

function Root() {
  const [{ mode, projectId }, setRoute] = useState(readMode)

  // Listen for back/forward navigation
  useEffect(() => {
    const onPop = () => setRoute(readMode())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')!
    if (mode === 'landing') {
      html.dataset.theme = 'glass'
      html.style.background = MESH_BG
      html.style.height = 'auto'
      body.style.background = 'transparent'
      body.style.height = 'auto'
      body.style.minHeight = '100vh'
      body.style.color = 'var(--fg)'
      root.style.height = 'auto'
      root.style.minHeight = '100vh'
    } else {
      html.dataset.theme = 'dark'
      html.style.background = ''
      html.style.height = ''
      body.style.background = ''
      body.style.height = ''
      body.style.minHeight = ''
      body.style.color = ''
      root.style.height = ''
      root.style.minHeight = ''
    }
  }, [mode])

  if (mode === 'embed' && projectId) return <EmbedView projectId={projectId} />
  if (mode === 'studio') return <App initialProjectId={projectId} />
  return (
    <Landing
      onEnter={(pid) => {
        const url = pid ? `?studio&project=${pid}` : '?studio'
        history.pushState(null, '', url)
        setRoute(readMode())
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
