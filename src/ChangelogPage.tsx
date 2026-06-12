const Logo = () => (
  <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
    <svg viewBox="0 0 40 40" width={28} height={28} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="cl-orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="cl-blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#cl-orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#cl-blush)" />
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

type Release = { version: string; date: string; tag: string; items: string[] }

const RELEASES: Release[] = [
  {
    version: '0.3',
    date: 'Junio 2026',
    tag: 'Platform',
    items: [
      'Persistencia de video en Supabase Storage — los clips sobreviven al reload.',
      'Batch export: muchos screenshots → un ZIP con el mismo template.',
      'API /api/render y /api/render/batch con Playwright (Vercel).',
      'Animación de cámara: presets (orbit in, hero sweep…) + editor de keyframes.',
      'Nuevos dispositivos: iPad y Apple Watch (procedural).',
      'Agente AI: subir screenshot, aplicar preset de cámara y exportar PNG.',
    ],
  },
  {
    version: '0.2',
    date: 'Junio 2026',
    tag: 'Quick wins',
    items: [
      'Templates de escena: 8 composiciones curadas listas para usar.',
      'Aspect ratios sociales (1:1, 4:5, 9:16, 16:9, Open Graph) con marco de recorte en el viewport.',
      'Export GIF en loop desde clips de video.',
      'Presets de cámara: vistas integradas y guardado de tus propios encuadres.',
      'Controles de iluminación: ambiente HDRI, luz ambiente y luz principal.',
      'Páginas de Templates, Pricing y Changelog.',
    ],
  },
  {
    version: '0.1',
    date: 'Junio 2026',
    tag: 'Alpha',
    items: [
      'Estudio 3D en el navegador con iPhone y MacBook.',
      'Multi-dispositivo en una sola escena.',
      'Export PNG hasta 8K y video MP4/WebM con fondo transparente o chroma key.',
      'Proyectos con autosave, galería pública y embeds.',
      'Servidor MCP para generar mockups desde Cursor y Claude.',
      'Agente AI que arma la escena por chat.',
    ],
  },
]

export default function ChangelogPage() {
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
          maxWidth: 720,
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
          Changelog
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--fg-2)', margin: '0 0 48px', maxWidth: 540 }}>
          Lo nuevo en openmockup.dev. Proyecto de código abierto en estado beta.
        </p>

        {RELEASES.map((r) => (
          <section key={r.version} style={{ marginBottom: 44 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: '-0.02em',
                }}
              >
                v{r.version}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '3px 9px',
                }}
              >
                {r.tag}
              </span>
              <span style={{ fontSize: 13, color: 'var(--fg-3)', marginLeft: 'auto' }}>{r.date}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'none' }}>
              {r.items.map((item, i) => (
                <li
                  key={i}
                  style={{
                    position: 'relative',
                    fontSize: 15,
                    lineHeight: 1.7,
                    color: 'var(--fg-2)',
                    paddingLeft: 18,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, color: 'var(--accent)' }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
