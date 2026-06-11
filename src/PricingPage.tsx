const Logo = () => (
  <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
    <svg viewBox="0 0 40 40" width={28} height={28} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="pr-orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="pr-blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#pr-orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#pr-blush)" />
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

const featureRow = (label: string, free: boolean, pro: boolean) => ({ label, free, pro })

const FEATURES = [
  featureRow('Mockups 3D ilimitados', true, true),
  featureRow('iPhone y MacBook', true, true),
  featureRow('Export PNG hasta 8K', true, true),
  featureRow('Export video (MP4 / WebM) y GIF', true, true),
  featureRow('Fondo transparente y chroma key', true, true),
  featureRow('Templates y aspect ratios sociales', true, true),
  featureRow('Servidor MCP para Cursor y Claude', true, true),
  featureRow('Galería pública sin marca de agua', true, true),
  featureRow('Más dispositivos (iPad, Watch, Vision Pro)', false, true),
  featureRow('Batch export y API server-side', false, true),
  featureRow('Workspaces de equipo', false, true),
]

const Check = ({ on }: { on: boolean }) =>
  on ? (
    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>
  ) : (
    <span style={{ color: 'var(--fg-3)' }}>—</span>
  )

export default function PricingPage() {
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
          maxWidth: 760,
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
            textAlign: 'center',
          }}
        >
          Gratis durante la beta
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: 'var(--fg-2)',
            margin: '0 auto 48px',
            maxWidth: 520,
            textAlign: 'center',
          }}
        >
          Todo lo de openmockup.dev es gratis mientras estamos en beta. Sin tarjeta, sin email gate.
          Un plan Pro con dispositivos extra y herramientas de equipo llegará más adelante.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            alignItems: 'center',
            gap: '0 20px',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '8px 20px',
            background: 'var(--surface-2)',
          }}
        >
          <span />
          <span style={{ textAlign: 'center', padding: '14px 0', fontWeight: 700, fontSize: 14 }}>
            Free
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--accent)' }}>
              Beta
            </span>
          </span>
          <span style={{ textAlign: 'center', padding: '14px 0', fontWeight: 700, fontSize: 14, color: 'var(--fg-2)' }}>
            Pro
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--fg-3)' }}>
              Pronto
            </span>
          </span>

          {FEATURES.map((f) => (
            <div key={f.label} style={{ display: 'contents' }}>
              <span
                style={{
                  padding: '12px 0',
                  fontSize: 14,
                  color: 'var(--fg-2)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {f.label}
              </span>
              <span style={{ textAlign: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <Check on={f.free} />
              </span>
              <span style={{ textAlign: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <Check on={f.pro} />
              </span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <a
            href="?studio"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: '#fff',
              font: '600 16px/1 var(--font-sans)',
              textDecoration: 'none',
              boxShadow: '0 6px 20px -6px var(--accent-glow)',
            }}
          >
            Abrir el studio gratis →
          </a>
        </div>
      </div>
    </>
  )
}
