import { useEffect, useRef, useState } from 'react'
import { projectStore, type ProjectSummary } from './projectStore'
import { SUPABASE_ENABLED } from './useAuth'

type Props = {
  onEnter: (pid?: string | null) => void
  onSignIn: () => void
  userEmail: string | null
  onSignOut: () => void
}

const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <svg viewBox="0 0 40 40" width={30} height={30} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#blush)" />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
      openmockup<span style={{ color: 'var(--accent)' }}>.dev</span>
    </span>
  </div>
)

const navLinks: { label: string; href: string }[] = [
  { label: 'Features', href: '#features' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Templates', href: '?templates' },
  { label: 'Pricing', href: '?pricing' },
  { label: 'Changelog', href: '?changelog' },
]

const MCP_SERVER_NAME = 'mcp-openmockup'
const MCP_CONFIG = { command: 'npx', args: ['-y', MCP_SERVER_NAME] } as const
const MCP_CONFIG_B64 =
  typeof btoa === 'function' ? btoa(JSON.stringify(MCP_CONFIG)) : ''
const CURSOR_MCP_INSTALL_URL = `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${MCP_CONFIG_B64}`
const CLAUDE_MCP_CMD = `claude mcp add --scope user ${MCP_SERVER_NAME} -- npx -y ${MCP_SERVER_NAME}`
const CLAUDE_MCP_PROMPT = `Run this command to install the OpenMockup MCP server:\n\n${CLAUDE_MCP_CMD}`
const CLAUDE_MCP_INSTALL_URL = `claude-cli://open?q=${encodeURIComponent(CLAUDE_MCP_PROMPT)}`

function CursorIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 12l9-5M12 12v10M12 12L3 7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function ClaudeIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3c-2.2 3.2-4.8 5.4-8 6.6 2.4 1 4.4 2.8 6 5.1 1.6-2.3 3.6-4.1 6-5.1C16.8 8.4 14.2 6.2 12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6 18.5c2.2-1.2 4-3 5.6-5.4M18 18.5c-2.2-1.2-4-3-5.6-5.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

const logos = ['Linear', 'Vercel', 'Arc', 'Raycast', 'Framer', 'Notion']

const features = [
  {
    icon: '◐',
    color: '#6e4bff',
    title: 'Real-time 3D',
    body: 'Drag, rotate, light. No render queue, no waiting. The viewport is the mockup.',
  },
  {
    icon: '▢',
    color: '#6e4bff',
    title: 'iPhone & Mac',
    body: 'Drop a screen into an iPhone or MacBook. Every angle, every color, multi-device scenes.',
  },
  {
    icon: '✦',
    color: '#6e4bff',
    title: 'Motion mockups',
    body: 'Play a screen recording inside the device. Export as GIF or MP4/WebM in one click.',
  },
]

const GALLERY_SKELETON_COUNT = 3
/** Render embed iframes at N× card size, then scale down for crisp WebGL on retina. */
const GALLERY_EMBED_SCALE = 2.5

function GallerySkeleton({ aspect = 4 / 3 }: { aspect?: number }) {
  return (
    <div
      className="landing-gallery-card landing-gallery-skeleton"
      style={{ aspectRatio: String(aspect), height: 'auto' }}
      aria-hidden
    />
  )
}

function GalleryProjectCard({
  project,
  onOpen,
}: {
  project: ProjectSummary
  onOpen: (id: string) => void
}) {
  const [mediaLoaded, setMediaLoaded] = useState(false)

  const inset = Math.max(0, Math.min(0.5, project.viewportInsetRight || 0))
  const aspect = Math.max(0.5, (project.viewportAspect || 1) * (1 - inset))
  const iframeWidthPct = 100 / (1 - inset)
  const embedScale = GALLERY_EMBED_SCALE

  useEffect(() => {
    setMediaLoaded(false)

    function onEmbedReady(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; projectId?: string } | null
      if (data?.type !== 'openmockup:embed-ready' || data.projectId !== project.id) return
      setMediaLoaded(true)
    }

    window.addEventListener('message', onEmbedReady)
    const fallback = window.setTimeout(() => setMediaLoaded(true), 8000)

    return () => {
      window.removeEventListener('message', onEmbedReady)
      window.clearTimeout(fallback)
    }
  }, [project.id])

  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      className={`landing-gallery-card${mediaLoaded ? '' : ' landing-gallery-card-loading'}`}
      style={{
        padding: 0,
        border: 'none',
        background: '#0a0614',
        cursor: 'pointer',
        textAlign: 'left',
        height: 'auto',
        aspectRatio: String(aspect),
        overflow: 'hidden',
      }}
      aria-label={`Open ${project.name} in studio`}
      aria-busy={mediaLoaded ? undefined : true}
    >
      <div
        className="landing-gallery-card-skeleton"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          opacity: mediaLoaded ? 0 : 1,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
        }}
        aria-hidden={mediaLoaded}
      />
      <iframe
        src={`?project=${project.id}&embed=1`}
        title={project.name}
        loading="lazy"
        className="landing-gallery-card-media landing-gallery-card-embed"
        style={{
          width: `${iframeWidthPct * embedScale}%`,
          height: `${embedScale * 100}%`,
          border: 'none',
          display: 'block',
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1,
          transform: `scale(${1 / embedScale})`,
          transformOrigin: 'top left',
          visibility: mediaLoaded ? 'visible' : 'hidden',
          opacity: mediaLoaded ? 1 : 0,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 3,
          opacity: mediaLoaded ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      >
        <span style={{
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(0,0,0,.45)',
          fontSize: 12, fontWeight: 500, color: '#fff',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,.15)',
        }}>{project.name}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 3,
          opacity: mediaLoaded ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      >
        <span style={{
          padding: '5px 11px', borderRadius: 999,
          background: 'rgba(110,75,255,.6)',
          fontSize: 12, fontWeight: 600, color: '#fff',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}>Open ↗</span>
      </div>
    </button>
  )
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLElement).dataset.visible = 'true'
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

export default function Landing({ onEnter, onSignIn, userEmail, onSignOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [publicProjects, setPublicProjects] = useState<ProjectSummary[]>([])
  const [mcpCopied, setMcpCopied] = useState<'cursor' | 'claude' | null>(null)
  const featuresHeaderRef = useReveal<HTMLDivElement>()
  const featuresGridRef = useReveal<HTMLDivElement>()
  const galleryHeaderRef = useReveal<HTMLDivElement>()
  const galleryGridRef = useReveal<HTMLDivElement>()
  const ctaCardRef = useReveal<HTMLDivElement>()

  useEffect(() => {
    projectStore.listPublic(3)
      .then(setPublicProjects)
      .catch(() => setPublicProjects([]))
      .finally(() => setGalleryLoading(false))
  }, [])

  return (
    <div
      className="landing"
      style={{
        minHeight: '100vh',
        fontFamily: 'var(--font-sans)',
        color: 'var(--fg)',
        WebkitFontSmoothing: 'antialiased',
        position: 'relative',
      }}
    >
      {/* Fixed animated aurora background */}
      <div className="landing-bg-aurora" aria-hidden />

      {/* ── Nav ── */}
      <nav className="landing-nav">
        <Logo />
        <div className="landing-nav-links">
          {navLinks.map(l => (
            <a key={l.label} href={l.href} style={{
              padding: '6px 12px', border: 'none', background: 'transparent',
              font: '500 14px/1 var(--font-sans)', color: 'var(--fg-2)',
              cursor: 'pointer', borderRadius: 'var(--radius)', letterSpacing: '-0.005em',
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-2)')}
            >{l.label}</a>
          ))}
        </div>
        <div className="landing-nav-ctas">
          {userEmail ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6e4bff, #ff7eb6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {userEmail[0].toUpperCase()}
              </div>
              <button type="button" onClick={onSignOut} className="landing-nav-signin">
                Sign out
              </button>
            </div>
          ) : SUPABASE_ENABLED ? (
            <button type="button" className="landing-nav-signin" onClick={onSignIn}>Sign in</button>
          ) : null}
          <button
            type="button"
            className="landing-nav-menu-btn"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen ? 'true' : 'false'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
          <button onClick={() => onEnter()} style={{
            padding: '8px 18px', border: 'none',
            background: 'var(--accent)', borderRadius: 999,
            font: '600 14px/1 var(--font-sans)', color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 4px 14px -4px var(--accent-glow)',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'filter .15s ease, transform .15s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
          >Open studio <span style={{ fontSize: 13 }}>↗</span></button>
        </div>
      </nav>
      <div className="landing-mobile-menu" data-open={menuOpen ? 'true' : 'false'} role="navigation" aria-label="Mobile">
        {navLinks.map(l => (
          <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
        ))}
        <button type="button" onClick={() => { setMenuOpen(false); onEnter() }}>Open studio</button>
      </div>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--fg-2)', marginBottom: 28,
          }}><span className="landing-hero-badge-sparkle">✦</span> MCP server on npm</div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(54px, 7vw, 104px)',
            lineHeight: 0.96, letterSpacing: 'var(--letter-display)',
            margin: '0 0 24px', color: 'var(--fg)',
          }}>
            Mockups{' '}
            <span className="landing-pop">that pop.</span>
            <br />Made in seconds.
          </h1>

          <p className="landing-hero-desc">
            Drag your screens into beautifully lit iPhones and Macs — in the browser
            or straight from Cursor and Claude via MCP.
          </p>

          <div className="landing-hero-actions">
            <button onClick={() => onEnter()} className="landing-cta-primary" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 24px', borderRadius: 999, border: 'none',
              background: 'var(--accent)', color: '#fff',
              font: '600 16px/1 var(--font-sans)', letterSpacing: '-0.005em',
              cursor: 'pointer',
              boxShadow: '0 6px 20px -6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,.25)',
              transition: 'filter .15s ease, transform .15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
            >Start a mockup <span className="landing-cta-arrow">→</span></button>

            <div className="landing-hero-mcp">
              <p className="landing-hero-mcp-label">Install MCP</p>
              <div className="landing-hero-mcp-buttons">
                <a
                  href={CURSOR_MCP_INSTALL_URL}
                  className="landing-mcp-btn"
                  onClick={() => {
                    setMcpCopied('cursor')
                    window.setTimeout(() => setMcpCopied(null), 2200)
                  }}
                >
                  <CursorIcon />
                  <span>{mcpCopied === 'cursor' ? 'Opening Cursor…' : 'Add to Cursor'}</span>
                </a>
                <a
                  href={CLAUDE_MCP_INSTALL_URL}
                  className="landing-mcp-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(CLAUDE_MCP_CMD).catch(() => {})
                    setMcpCopied('claude')
                    window.setTimeout(() => setMcpCopied(null), 2200)
                  }}
                >
                  <ClaudeIcon />
                  <span>{mcpCopied === 'claude' ? 'Opening Claude…' : 'Add to Claude'}</span>
                </a>
              </div>
              <p className="landing-hero-mcp-hint">
                Cursor installs in one click · Claude opens with the install command ready to run
                {' · '}
                <code className="landing-hero-mcp-cmd">npx -y {MCP_SERVER_NAME}</code>
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="landing-logos">
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--fg-3)', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
          Trusted by teams at
        </span>
        <div className="landing-logos-viewport">
          <div className="landing-logos-track">
            {[...logos, ...logos].map((l, i) => (
              <span key={`${l}-${i}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-3)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{l}</span>
            ))}
          </div>
        </div>
      </div>

      <section id="features" className="landing-section" style={{ scrollMarginTop: 80 }}>
        <div ref={featuresHeaderRef} className="landing-reveal" style={{ marginBottom: 56 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--fg-2)', marginBottom: 20,
          }}>Why teams love it</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(36px, 4vw, 60px)', letterSpacing: '-0.04em', lineHeight: 1.02,
            margin: 0, color: 'var(--fg)',
          }}>
            Every angle, every backdrop,<br />every device.
          </h2>
        </div>

        <div ref={featuresGridRef} className="landing-features-grid landing-reveal" data-delay="1">
          {features.map(f => (
            <div key={f.title}
              className="landing-feature-card"
              style={{
                background: 'var(--surface)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                backdropFilter: 'blur(20px) saturate(160%)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-1)',
                padding: '32px 28px 36px',
              }}
            >
              <div className="landing-feature-icon" style={{
                width: 44, height: 44, borderRadius: 12,
                background: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: '#fff', marginBottom: 20,
                boxShadow: `0 6px 16px -4px ${f.color}88`,
              }}>{f.icon}</div>
              <h3 style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-0.02em', margin: '0 0 10px', color: 'var(--fg)' }}>{f.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--fg-2)', margin: 0 }}>{f.body}</p>
              <button style={{
                marginTop: 20, padding: 0, border: 'none', background: 'none',
                font: '500 14px/1 var(--font-sans)', color: 'var(--accent)',
                cursor: 'pointer', letterSpacing: '-0.005em',
              }}>Learn more →</button>
            </div>
          ))}
        </div>
      </section>

      <section id="gallery" className="landing-gallery-section" style={{ scrollMarginTop: 80 }}>
        <div ref={galleryHeaderRef} className="landing-gallery-header landing-reveal">
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(28px, 3vw, 44px)', letterSpacing: '-0.04em', margin: 0, color: 'var(--fg)' }}>
            See it in action
          </h2>
          <button style={{
            padding: '10px 18px', borderRadius: 999,
            border: '1px solid var(--border-2)', background: 'var(--surface)',
            font: '500 14px/1 var(--font-sans)', color: 'var(--fg)',
            cursor: 'pointer',
            WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
          }}>Explore gallery →</button>
        </div>
        <div ref={galleryGridRef} className="landing-gallery-grid landing-reveal" data-delay="1">
          {galleryLoading
            ? Array.from({ length: GALLERY_SKELETON_COUNT }, (_, i) => (
                <GallerySkeleton key={`skeleton-${i}`} />
              ))
            : publicProjects.map((p) => (
                <GalleryProjectCard key={p.id} project={p} onOpen={onEnter} />
              ))}
        </div>
      </section>

      <section className="landing-cta-section">
        <div ref={ctaCardRef} className="landing-cta-card landing-reveal">
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(36px, 4vw, 60px)', letterSpacing: '-0.04em', lineHeight: 1.02,
            margin: '0 0 16px', color: 'var(--fg)',
          }}>
            Make your product look<br />as good as it is.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)', margin: '0 0 40px' }}>
            Free while in beta. No card, no email gate. Just open the studio and drop a screen.
          </p>
          <div className="landing-cta-actions">
            <button onClick={() => onEnter()} className="landing-cta-primary" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 24px', borderRadius: 999, border: 'none',
              background: 'var(--accent)', color: '#fff',
              font: '600 16px/1 var(--font-sans)', letterSpacing: '-0.005em',
              cursor: 'pointer',
              boxShadow: '0 6px 20px -6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,.25)',
              transition: 'filter .15s ease, transform .15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
            >Open openmockup.dev <span className="landing-cta-arrow">→</span></button>
            <a href="?pricing" style={{
              padding: '14px 22px', borderRadius: 999,
              border: '1px solid var(--border-2)', background: 'var(--surface-2)',
              font: '500 16px/1 var(--font-sans)', color: 'var(--fg)',
              cursor: 'pointer', textDecoration: 'none',
            }}>See pricing</a>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '20px 0 0' }}>
            Works in your browser · No install required
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <Logo />
        <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>Built with care in Bogotá</span>
        <a href="?changelog" style={{ fontSize: 13, color: 'var(--fg-3)', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-3)')}
        >Changelog</a>
        <a href="?terms" style={{ fontSize: 13, color: 'var(--fg-3)', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-3)')}
        >Terms of Service</a>
      </footer>
    </div>
  )
}
