import { useEffect, useState } from 'react'
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

  if (status === 'missing') {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: 'rgba(255,255,255,.5)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
        }}
      >
        Project not found.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#000' }}>
      <Scene />
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
