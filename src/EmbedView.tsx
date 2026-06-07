import { useCallback, useEffect, useState } from 'react'
import { Scene } from './Scene'
import { useStore } from './store'
import { projectStore, type Project } from './projectStore'

type Props = { projectId: string }

export default function EmbedView({ projectId }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [project, setProject] = useState<Project | null>(null)
  const hydrate = useStore((s) => s.hydrateFromSnapshot)
  const setAutoRotate = useStore((s) => s.setAutoRotate)
  const setCameraPanFree = useStore((s) => s.setCameraPanFree)

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top

  useEffect(() => {
    let cancelled = false
    projectStore.get(projectId).then((p) => {
      if (cancelled) return
      if (!p) {
        setStatus('missing')
        return
      }
      hydrate(p.snapshot)
      // Freeze the preview at the saved pose so the gallery card matches
      // the camera/device framing the author left in the studio. Without
      // this, tickAutoRotate keeps spinning the device every frame.
      setAutoRotate(false)
      setCameraPanFree(false)
      setProject(p)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [projectId, hydrate, setAutoRotate, setCameraPanFree])

  const embedDpr = typeof window !== 'undefined'
    ? Math.min(3, Math.max(2, window.devicePixelRatio))
    : 2

  const notifyParentReady = useCallback(() => {
    if (!isInIframe || window.parent === window) return
    window.parent.postMessage(
      { type: 'openmockup:embed-ready', projectId },
      window.location.origin,
    )
  }, [isInIframe, projectId])

  const shellStyle = {
    position: 'relative' as const,
    width: '100%',
    height: isInIframe ? '100%' : '100vh',
    flex: isInIframe ? 1 : undefined,
    minHeight: isInIframe ? 0 : undefined,
    background: '#0a0614',
  }

  if (status === 'missing') {
    return (
      <div
        style={{
          ...shellStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,.5)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
        }}
      >
        Project not found.
      </div>
    )
  }

  if (status === 'loading') {
    return <div className="landing-gallery-embed-skeleton" style={shellStyle} aria-hidden />
  }

  return (
    <div style={shellStyle}>
      <Scene dpr={embedDpr} onReady={notifyParentReady} />
      {project && !isInIframe && (
        <a
          href={`?studio&project=${project.id}`}
          target="_top"
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(0,0,0,.5)',
            color: '#fff',
            textDecoration: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 500,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.15)',
            letterSpacing: '-0.005em',
          }}
        >
          Open in studio ↗
        </a>
      )}
    </div>
  )
}
