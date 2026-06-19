import { listAllSceneTemplates } from './sceneTemplates'
import { getCachedThumbnail, isImageThumbnail, templatePreviewStyle } from './templateThumbnails'

const Logo = () => (
  <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
    <svg viewBox="0 0 40 40" width={28} height={28} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="tpl-orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="tpl-blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#tpl-orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#tpl-blush)" />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
      openmockup<span style={{ color: 'var(--accent)' }}>.dev</span>
    </span>
  </a>
)

const nav: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  padding: '18px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border)',
  background: 'rgba(var(--bg-rgb, 10,6,26),.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  zIndex: 10,
}

function TemplateGalleryCard({ template }: { template: ReturnType<typeof listAllSceneTemplates>[number] }) {
  const cached = getCachedThumbnail(template.id)
  const thumb =
    isImageThumbnail(template.thumbnail) ? template.thumbnail : cached ?? template.thumbnail

  return (
    <a
      href={`?studio&template=${template.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        overflow: 'hidden',
        textDecoration: 'none',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        transition: 'transform .15s ease, border-color .15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <span aria-hidden style={{ display: 'block', height: 130, ...templatePreviewStyle(thumb) }} />
      <span style={{ padding: '14px 16px 16px' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--fg)' }}>
            {template.name}
            {template.id.startsWith('user-') ? ' ★' : ''}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--fg-3)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '3px 8px',
            }}
          >
            {template.category}
          </span>
        </span>
        <span style={{ display: 'block', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-2)' }}>
          {template.description}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            marginTop: 12,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--accent)',
          }}
        >
          Usar en studio →
        </span>
      </span>
    </a>
  )
}

export default function TemplatesPage() {
  const templates = listAllSceneTemplates()

  return (
    <>
      <nav style={nav}>
        <Logo />
        <a href="/" style={{ fontSize: 13, color: 'var(--fg-2)', textDecoration: 'none' }}>
          ← Back to home
        </a>
      </nav>

      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '0 24px 80px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(32px, 4vw, 52px)',
            letterSpacing: '-0.04em',
            lineHeight: 1.04,
            margin: '56px 0 12px',
          }}
        >
          Templates
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--fg-2)', margin: '0 0 48px', maxWidth: 560 }}>
          Escenas listas para usar. Elige una, abre el studio y suelta tu captura — la composición,
          la cámara y la iluminación ya están resueltas.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {templates.map((t) => (
            <TemplateGalleryCard key={t.id} template={t} />
          ))}
        </div>
      </div>
    </>
  )
}
