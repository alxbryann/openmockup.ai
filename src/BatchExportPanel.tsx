import { useCallback, useRef, useState } from 'react'
import { SCENE_TEMPLATES } from './sceneTemplates'
import { ASPECT_PRESETS } from './aspectPresets'
import { downloadBatchZip, runBatchExport, type BatchItem } from './batchExport'
import type { AspectPreset } from './store'

type Props = {
  onClose: () => void
}

export function BatchExportPanel({ onClose }: Props) {
  const [items, setItems] = useState<BatchItem[]>([])
  const [templateId, setTemplateId] = useState(SCENE_TEMPLATES[0]?.id ?? '')
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>('1:1')
  const [exportPreset, setExportPreset] = useState<'screen' | 1920 | 3840>(1920)
  const [transparent, setTransparent] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, name: '' })
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    const next: BatchItem[] = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      next.push({ name: f.name, file: f })
    }
    setItems((prev) => [...prev, ...next].slice(0, 30))
    setError(null)
  }, [])

  async function startExport() {
    if (items.length === 0) {
      setError('Add at least one screenshot.')
      return
    }
    setRunning(true)
    setError(null)
    abortRef.current = new AbortController()
    try {
      const blob = await runBatchExport({
        items,
        templateId: templateId || undefined,
        aspectPreset,
        exportPreset,
        transparent,
        signal: abortRef.current.signal,
        onProgress: (done, total, name) => setProgress({ done, total, name }),
      })
      downloadBatchZip(blob)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Batch export failed')
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

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
        aria-labelledby="batch-export-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 id="batch-export-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Batch export
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', cursor: 'pointer', fontSize: 20 }}>
            ×
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '0 0 16px' }}>
          Apply one template to many screenshots and download a ZIP (max 30 PNGs).
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{ width: '100%', marginBottom: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
        >
          {SCENE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Aspect ratio</label>
        <select
          value={aspectPreset}
          onChange={(e) => setAspectPreset(e.target.value as AspectPreset)}
          style={{ width: '100%', marginBottom: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
        >
          {ASPECT_PRESETS.filter((p) => p.id !== 'free').map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Resolution</label>
        <select
          value={exportPreset}
          onChange={(e) => {
            const v = e.target.value
            setExportPreset(v === 'screen' ? 'screen' : (Number(v) as 1920 | 3840))
          }}
          style={{ width: '100%', marginBottom: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)' }}
        >
          <option value={1920}>1080p long edge</option>
          <option value={3840}>4K long edge</option>
          <option value="screen">Screen size</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
          Transparent PNG
        </label>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files) }}
          style={{
            border: '2px dashed var(--border)',
            borderRadius: 12,
            padding: 20,
            textAlign: 'center',
            marginBottom: 12,
            cursor: 'pointer',
          }}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>Drop screenshots or click to add</div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{items.length} file(s)</div>
        </div>

        {items.length > 0 && (
          <ul style={{ maxHeight: 120, overflow: 'auto', fontSize: 12, color: 'var(--fg-2)', margin: '0 0 12px', paddingLeft: 18 }}>
            {items.map((it, i) => (
              <li key={`${it.name}-${i}`}>{it.name}</li>
            ))}
          </ul>
        )}

        {running && (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 12 }}>
            {progress.done}/{progress.total} — {progress.name}
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={running}
            onClick={startExport}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}
          >
            {running ? 'Exporting…' : 'Export ZIP'}
          </button>
          {running && (
            <button type="button" onClick={cancel} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg)', cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
