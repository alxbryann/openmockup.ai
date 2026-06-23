import { useEffect, useState } from 'react'
import { listProjectRevisions, type ProjectRevision } from './projectHistory'
import type { ProjectSnapshot } from './projectStore'

type Props = {
  projectId: string
  open: boolean
  onClose: () => void
  onRestore: (snapshot: ProjectSnapshot) => void
}

export function ProjectHistoryPanel({ projectId, open, onClose, onRestore }: Props) {
  const [revisions, setRevisions] = useState<ProjectRevision[]>([])

  useEffect(() => {
    if (!open) return
    setRevisions(listProjectRevisions(projectId))
  }, [open, projectId])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Historial de versiones</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--fg-2)' }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '0 0 16px' }}>
          Snapshots automáticos cada ~60 s. Restaura una versión anterior de la escena.
        </p>
        {revisions.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-3)' }}>Aún no hay revisiones guardadas.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {revisions.map((r) => (
              <li
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}
              >
                {r.thumbnail && (
                  <img src={r.thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Restaurar esta versión? Los cambios actuales se conservarán en el historial.')) {
                      onRestore(r.snapshot)
                      onClose()
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
