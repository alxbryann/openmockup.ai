import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import Landing from './Landing.tsx'
import EmbedView from './EmbedView.tsx'
import TermsPage from './TermsPage.tsx'
import { AuthModal } from './AuthModal.tsx'
import { useAuth, SUPABASE_ENABLED } from './useAuth.ts'
import './renderApi'  // Headless render API for Playwright automation

const MESH_BG = [
  'radial-gradient(60% 50% at 80% 10%, #ffd1f5 0%, transparent 60%)',
  'radial-gradient(50% 50% at 10% 30%, #c3e9ff 0%, transparent 55%)',
  'radial-gradient(70% 60% at 50% 100%, #d6ffe9 0%, transparent 60%)',
  'linear-gradient(180deg, #f4ecff 0%, #ffefe7 100%)',
].join(', ')

type Mode = 'landing' | 'studio' | 'embed' | 'terms'

function readMode(): { mode: Mode; projectId: string | null } {
  const q = new URLSearchParams(location.search)
  const projectId = q.get('project')
  if (q.has('embed') && projectId) return { mode: 'embed', projectId }
  if (q.has('studio')) return { mode: 'studio', projectId }
  if (q.has('terms')) return { mode: 'terms', projectId: null }
  return { mode: 'landing', projectId: null }
}

function Root() {
  const [{ mode, projectId }, setRoute] = useState(readMode)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()

  // Listen for back/forward navigation
  useEffect(() => {
    const onPop = () => setRoute(readMode())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // If URL has ?studio but Supabase auth is required and user is not logged in,
  // redirect back to landing and surface the auth modal.
  useEffect(() => {
    if (!SUPABASE_ENABLED || authLoading) return
    if (mode === 'studio' && !user) {
      history.replaceState(null, '', '/')
      setRoute(readMode())
      setShowAuth(true)
    }
  }, [mode, user, authLoading])

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

  function enterStudio(pid?: string | null) {
    // If Supabase auth is required and user is not signed in, show auth modal
    if (SUPABASE_ENABLED && !user) {
      setPendingProjectId(pid ?? null)
      setShowAuth(true)
      return
    }
    const url = pid ? `?studio&project=${pid}` : '?studio'
    history.pushState(null, '', url)
    setRoute(readMode())
  }

  function onAuthSuccess() {
    setShowAuth(false)
    const url = pendingProjectId ? `?studio&project=${pendingProjectId}` : '?studio'
    history.pushState(null, '', url)
    setRoute(readMode())
    setPendingProjectId(null)
  }

  if (mode === 'embed' && projectId) return <EmbedView projectId={projectId} />

  if (mode === 'terms') return <TermsPage />

  if (mode === 'studio') {
    // While auth is resolving, show a minimal dark splash instead of flashing the studio
    if (SUPABASE_ENABLED && authLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#080b10' }}>
          <div className="mockit-spinner" />
        </div>
      )
    }
    return <App initialProjectId={projectId} />
  }

  return (
    <>
      <Landing
        onEnter={enterStudio}
        onSignIn={() => setShowAuth(true)}
        userEmail={user?.email ?? null}
        onSignOut={async () => {
          // Navigate first, then sign out — avoids the auth guard re-triggering
          history.pushState(null, '', '/')
          setRoute(readMode())
          if (SUPABASE_ENABLED) await import('./supabase').then(m => m.supabase.auth.signOut())
        }}
      />
      {showAuth && (
        <AuthModal onSuccess={onAuthSuccess} onClose={() => setShowAuth(false)} />
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
    <Analytics />
  </StrictMode>,
)
