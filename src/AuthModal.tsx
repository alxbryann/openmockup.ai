import { useState } from 'react'
import { getAuthRedirectUrl } from './authRedirect'
import { supabase } from './supabase'
import { SUPABASE_ENABLED } from './useAuth'

const AUTH_UNAVAILABLE =
  'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the dev server.'

type Tab = 'signin' | 'signup'

type Props = {
  onSuccess: () => void
  onClose: () => void
}

const OrbLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <svg viewBox="0 0 40 40" width={28} height={28} style={{ flexShrink: 0 }} aria-hidden>
      <defs>
        <radialGradient id="am-orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="am-blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#am-orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#am-blush)" />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', color: 'rgba(255,255,255,.9)', fontFamily: 'var(--font-sans)' }}>
      openmockup<span style={{ color: '#6e4bff' }}>.dev</span>
    </span>
  </div>
)

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export function AuthModal({ onSuccess, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setCheckEmail(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!SUPABASE_ENABLED || !supabase) {
      setError(AUTH_UNAVAILABLE)
      return
    }
    setError(null)
    setLoading(true)
    try {
      if (tab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSuccess()
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is disabled, session is active immediately
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          onSuccess()
        } else {
          setCheckEmail(true)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!SUPABASE_ENABLED || !supabase) {
      setError(AUTH_UNAVAILABLE)
      return
    }
    setError(null)
    setOauthLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl('?studio') },
      })
      if (error) throw error
      // On success the browser redirects to Google — oauthLoading stays true intentionally
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setOauthLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 10,
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: '#fff',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,.4)',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 7,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,4,16,.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 'min(420px, calc(100vw - 32px))',
        background: 'rgba(14,9,34,.97)',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 24,
        padding: '40px 36px',
        boxShadow: '0 48px 96px rgba(0,0,0,.7), 0 0 0 1px rgba(110,75,255,.15), inset 0 1px 0 rgba(255,255,255,.08)',
        position: 'relative',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 30, height: 30, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.1)',
            background: 'rgba(255,255,255,.05)',
            color: 'rgba(255,255,255,.45)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, lineHeight: 1, fontFamily: 'var(--font-sans)',
          }}
        >
          ×
        </button>

        <div style={{ marginBottom: 28 }}>
          <OrbLogo />
        </div>

        {checkEmail ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✉️</div>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
              Check your email
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'rgba(255,255,255,.5)', lineHeight: 1.6, margin: '0 0 28px' }}>
              We sent a confirmation link to <strong style={{ color: 'rgba(255,255,255,.8)' }}>{email}</strong>. Click it to activate your account.
            </p>
            <button
              onClick={() => setCheckEmail(false)}
              style={{
                padding: '10px 20px', border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.07)', borderRadius: 10,
                fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,.7)',
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.03em', color: '#fff', margin: '0 0 5px' }}>
              {tab === 'signin' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'rgba(255,255,255,.4)', margin: '0 0 28px', lineHeight: 1.5 }}>
              {tab === 'signin'
                ? 'Sign in to access your studio sessions.'
                : 'Free to start — no credit card required.'}
            </p>

            {/* Tab toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 3, gap: 2, marginBottom: 24 }}>
              {(['signin', 'signup'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  style={{
                    flex: 1, padding: '7px 0',
                    border: t === tab ? '1px solid rgba(110,75,255,.5)' : '1px solid transparent',
                    background: t === tab ? 'rgba(110,75,255,.28)' : 'transparent',
                    borderRadius: 7,
                    fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
                    color: t === tab ? '#fff' : 'rgba(255,255,255,.4)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {t === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
              ))}
            </div>

            {/* Google OAuth */}
            <button
              onClick={handleGoogle}
              disabled={oauthLoading}
              style={{
                width: '100%', padding: '11px 0', marginBottom: 20,
                border: '1px solid rgba(255,255,255,.13)',
                background: 'rgba(255,255,255,.06)', borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 14,
                color: 'rgba(255,255,255,.82)', cursor: 'pointer',
                opacity: oauthLoading ? 0.6 : 1, transition: 'background 0.15s, opacity 0.15s',
              }}
              onMouseEnter={(e) => { if (!oauthLoading) e.currentTarget.style.background = 'rgba(255,255,255,.11)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.06)' }}
            >
              <GoogleIcon />
              {oauthLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'rgba(255,255,255,.28)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,75,255,.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,75,255,.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)' }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,84,112,.08)', border: '1px solid rgba(255,84,112,.22)',
                  fontFamily: 'var(--font-sans)', fontSize: 13, color: '#ff8fa3', lineHeight: 1.45,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  padding: '13px 0', border: 'none',
                  background: '#6e4bff', borderRadius: 12,
                  fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15, color: '#fff',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 6px 20px -6px rgba(110,75,255,.55), inset 0 1px 0 rgba(255,255,255,.22)',
                  transition: 'opacity 0.15s, filter 0.15s',
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.filter = 'brightness(1.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
              >
                {loading ? 'Loading…' : tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'rgba(255,255,255,.25)', textAlign: 'center', margin: '20px 0 0' }}>
              Your mockups are saved to your account automatically.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
