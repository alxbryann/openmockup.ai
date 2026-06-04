import { Scene } from './Scene'

/**
 * Minimal full-screen canvas for headless rendering (?headless URL param).
 * No auth, no UI — just mounts the Three.js scene so window.renderMockup()
 * can be called by the MCP server via Playwright.
 */
export function HeadlessScene() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <Scene />
    </div>
  )
}
