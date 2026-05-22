import { useEffect, useState } from 'react'
import { projectStore, type ProjectSummary } from './projectStore'

type Props = {
  open: boolean
  currentProjectId: string | null
  onPick: (id: string) => void
  onCreate: () => void
  onClose: () => void
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function ProjectPicker({ open, currentProjectId, onPick, onCreate, onClose }: Props) {
  const [items, setItems] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    projectStore
      .list()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) {
      setRenamingId(null)
      setRenameValue('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleDelete(id: string) {
    if (!confirm('Delete this project? This cannot be undone.')) return
    await projectStore.delete(id)
    setItems(await projectStore.list())
  }

  function startRename(p: ProjectSummary) {
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  async function commitRename() {
    if (!renamingId) return
    const name = renameValue.trim()
    if (name.length > 0) {
      await projectStore.save(renamingId, { name })
      setItems(await projectStore.list())
    }
    setRenamingId(null)
    setRenameValue('')
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch project"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6,4,18,.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          maxHeight: 'min(80vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(18,12,40,.96)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 18,
          boxShadow: '0 24px 80px rgba(0,0,0,.5)',
          color: '#fff',
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Your projects
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
              Pick one to continue, or start fresh.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + New project
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: 12, flex: 1 }}>
          {loading ? (
            <p style={{ padding: 20, color: 'rgba(255,255,255,.5)', fontSize: 13 }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ padding: 20, color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
              No saved projects yet. Click <strong>New project</strong> to start.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((p) => {
                const isCurrent = p.id === currentProjectId
                const isRenaming = renamingId === p.id
                return (
                  <li key={p.id}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: isCurrent ? 'rgba(110,75,255,.15)' : 'transparent',
                        border: `1px solid ${isCurrent ? 'rgba(110,75,255,.4)' : 'transparent'}`,
                      }}
                    >
                      {isRenaming ? (
                        <div style={{ flex: 1 }}>
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                e.stopPropagation()
                                commitRename()
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                e.stopPropagation()
                                cancelRename()
                              }
                            }}
                            onBlur={() => commitRename()}
                            style={{
                              width: '100%',
                              background: 'rgba(0,0,0,.3)',
                              border: '1px solid rgba(110,75,255,.5)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              color: '#fff',
                              font: '600 14px/1.2 var(--font-sans)',
                              letterSpacing: '-0.005em',
                              outline: 'none',
                            }}
                          />
                          <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
                            Enter to save · Esc to cancel
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPick(p.id)}
                          onDoubleClick={() => startRename(p)}
                          style={{
                            flex: 1,
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            cursor: 'pointer',
                            padding: 0,
                            font: 'inherit',
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em' }}>
                            {p.name}
                            {isCurrent && (
                              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>
                                · current
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
                            Updated {formatRelative(p.updatedAt)}
                            {p.isPublic ? ' · public' : ' · private'}
                          </div>
                        </button>
                      )}
                      {!isRenaming && (
                        <>
                          <button
                            type="button"
                            onClick={() => startRename(p)}
                            aria-label={`Rename ${p.name}`}
                            title="Rename"
                            style={{
                              padding: 6,
                              borderRadius: 8,
                              border: 'none',
                              background: 'transparent',
                              color: 'rgba(255,255,255,.4)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.08)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
                            }}
                            onMouseLeave={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,.4)'
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            aria-label={`Delete ${p.name}`}
                            title="Delete"
                            style={{
                              padding: 6,
                              borderRadius: 8,
                              border: 'none',
                              background: 'transparent',
                              color: 'rgba(255,255,255,.4)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,80,80,.15)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = '#ff8080'
                            }}
                            onMouseLeave={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,.4)'
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
