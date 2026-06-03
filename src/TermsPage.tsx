const Logo = () => (
  <a
    href="/"
    style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}
  >
    <svg viewBox="0 0 40 40" width={28} height={28} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="t-orb" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".4" stopColor="#c5b3ff" />
          <stop offset="1" stopColor="#6e4bff" />
        </radialGradient>
        <radialGradient id="t-blush" cx="65%" cy="65%" r="60%">
          <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
          <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#t-orb)" />
      <circle cx="20" cy="20" r="17" fill="url(#t-blush)" />
      <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--fg)' }}>
      openmockup<span style={{ color: 'var(--accent)' }}>.dev</span>
    </span>
  </a>
)

const S = {
  wrap: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 24px 80px',
    fontFamily: 'var(--font-sans)',
    color: 'var(--fg)',
    WebkitFontSmoothing: 'antialiased',
  } as React.CSSProperties,
  nav: {
    position: 'sticky' as const,
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
    marginBottom: 0,
  } as React.CSSProperties,
  h1: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'clamp(32px, 4vw, 52px)',
    letterSpacing: '-0.04em',
    lineHeight: 1.04,
    margin: '56px 0 12px',
    color: 'var(--fg)',
  } as React.CSSProperties,
  meta: {
    fontSize: 13,
    color: 'var(--fg-3)',
    margin: '0 0 48px',
  } as React.CSSProperties,
  h2: {
    fontWeight: 700,
    fontSize: 18,
    letterSpacing: '-0.02em',
    margin: '40px 0 10px',
    color: 'var(--fg)',
  } as React.CSSProperties,
  p: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'var(--fg-2)',
    margin: '0 0 14px',
  } as React.CSSProperties,
  ul: {
    fontSize: 15,
    lineHeight: 1.7,
    color: 'var(--fg-2)',
    margin: '0 0 14px',
    paddingLeft: 22,
  } as React.CSSProperties,
  divider: {
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '48px 0',
  } as React.CSSProperties,
  a: {
    color: 'var(--accent)',
    textDecoration: 'none',
  } as React.CSSProperties,
}

export default function TermsPage() {
  return (
    <>
      <nav style={S.nav}>
        <Logo />
        <a href="/" style={{ fontSize: 13, color: 'var(--fg-2)', textDecoration: 'none' }}>
          ← Back to home
        </a>
      </nav>

      <div style={S.wrap}>
        <h1 style={S.h1}>Terms of Service</h1>
        <p style={S.meta}>Last updated: June 2, 2026</p>

        <p style={S.p}>
          Welcome to <strong>openmockup.dev</strong> ("the Service"), a browser-based 3D mockup
          tool operated by Bryan Riaño ("we", "us", or "our"). By using the Service you agree to
          these Terms. If you do not agree, please do not use it.
        </p>

        <h2 style={S.h2}>1. Use of the Service</h2>
        <p style={S.p}>
          openmockup.dev is provided free of charge during its public beta. You may use the Service
          for personal, commercial, and portfolio purposes. You agree not to:
        </p>
        <ul style={S.ul}>
          <li>Use the Service for any unlawful purpose or in violation of applicable laws.</li>
          <li>Upload content that infringes third-party intellectual property rights.</li>
          <li>Attempt to reverse-engineer, disrupt, or overload the Service.</li>
          <li>Scrape or automatically harvest data from the Service.</li>
        </ul>

        <h2 style={S.h2}>2. Your Content</h2>
        <p style={S.p}>
          You retain full ownership of any screenshots, images, or videos you upload to the
          Service. We do not claim any rights over your content. By uploading content you grant us
          a limited, non-exclusive licence to store and display it solely to operate the Service on
          your behalf.
        </p>
        <p style={S.p}>
          Projects are <strong>private by default</strong>. If you choose to make a project public,
          it may be displayed in the public gallery and visible to other users and visitors. You can
          revert a project to private at any time from the project picker.
        </p>

        <h2 style={S.h2}>3. Open Source</h2>
        <p style={S.p}>
          The source code of openmockup.dev is publicly available on GitHub. It is licensed under
          the MIT Licence. You are free to fork, modify, and redistribute the code under the terms
          of that licence.
        </p>

        <h2 style={S.h2}>4. Privacy & Data</h2>
        <p style={S.p}>
          We collect the minimum data necessary to operate the Service:
        </p>
        <ul style={S.ul}>
          <li>
            <strong>Account data</strong> — your email address when you sign up (via Supabase Auth).
          </li>
          <li>
            <strong>Project data</strong> — mockup snapshots and thumbnails stored in our database
            so you can continue your work across sessions.
          </li>
          <li>
            <strong>Analytics</strong> — aggregated, anonymous usage events collected by Vercel
            Analytics (no cookies, no cross-site tracking).
          </li>
        </ul>
        <p style={S.p}>
          We do not sell your data, share it with advertisers, or use it for any purpose other than
          operating and improving the Service. You can delete your account and all associated data
          at any time by contacting us at{' '}
          <a href="mailto:bryanalexanderbogota@gmail.com" style={S.a}>
            bryanalexanderbogota@gmail.com
          </a>
          .
        </p>

        <h2 style={S.h2}>5. Third-Party Services</h2>
        <p style={S.p}>
          The Service relies on the following third-party providers, each with their own privacy
          practices:
        </p>
        <ul style={S.ul}>
          <li>
            <strong>Supabase</strong> — database and authentication (
            <a href="https://supabase.com/privacy" style={S.a} target="_blank" rel="noreferrer">
              supabase.com/privacy
            </a>
            )
          </li>
          <li>
            <strong>Vercel</strong> — hosting and analytics (
            <a href="https://vercel.com/legal/privacy-policy" style={S.a} target="_blank" rel="noreferrer">
              vercel.com/legal/privacy-policy
            </a>
            )
          </li>
          <li>
            <strong>Anthropic</strong> — AI features via the Claude API (
            <a href="https://www.anthropic.com/legal/privacy" style={S.a} target="_blank" rel="noreferrer">
              anthropic.com/legal/privacy
            </a>
            )
          </li>
        </ul>

        <h2 style={S.h2}>6. Disclaimer of Warranties</h2>
        <p style={S.p}>
          The Service is provided <strong>"as is"</strong> without warranties of any kind, express
          or implied. We do not guarantee that the Service will be uninterrupted, error-free, or
          available at all times. Use it at your own risk.
        </p>

        <h2 style={S.h2}>7. Limitation of Liability</h2>
        <p style={S.p}>
          To the maximum extent permitted by law, we shall not be liable for any indirect,
          incidental, special, or consequential damages arising from your use of the Service,
          including loss of data or loss of profits.
        </p>

        <h2 style={S.h2}>8. Changes to These Terms</h2>
        <p style={S.p}>
          We may update these Terms from time to time. Continued use of the Service after changes
          are posted constitutes acceptance of the new Terms. We will update the "Last updated"
          date at the top of this page.
        </p>

        <h2 style={S.h2}>9. Contact</h2>
        <p style={S.p}>
          Questions about these Terms? Reach us at{' '}
          <a href="mailto:bryanalexanderbogota@gmail.com" style={S.a}>
            bryanalexanderbogota@gmail.com
          </a>
          .
        </p>

        <hr style={S.divider} />

        <p style={{ ...S.p, fontSize: 13, color: 'var(--fg-3)' }}>
          openmockup.dev · Built with care in Bogotá, Colombia
        </p>
      </div>
    </>
  )
}
