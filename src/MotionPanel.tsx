import { useCallback, useState } from 'react'
import { useStore } from './store'
import {
  CAMERA_MOTION_PRESETS,
  type CameraKeyframe,
  type CameraMotionPresetId,
} from './cameraMotionPresets'
import { exportCameraMotionVideo, type VideoExportBgMode } from './highResVideoExport'
import { resolveExportDimensions } from './aspectPresets'

export function MotionPanel() {
  const cameraMotion = useStore((s) => s.cameraMotion)
  const setCameraMotion = useStore((s) => s.setCameraMotion)
  const cameraKeyframes = useStore((s) => s.cameraKeyframes)
  const setCameraKeyframes = useStore((s) => s.setCameraKeyframes)
  const animationPlayback = useStore((s) => s.animationPlayback)
  const setAnimationPlayback = useStore((s) => s.setAnimationPlayback)
  const setAnimationTime = useStore((s) => s.setAnimationTime)
  const setMotionStartPose = useStore((s) => s.setMotionStartPose)
  const captureFrame = useStore((s) => s.captureSceneToCanvas)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportPreset, setExportPreset] = useState<1080 | 1920>(1080)
  const [mode, setMode] = useState<'preset' | 'keyframes'>('preset')
  const aspectPreset = useStore((s) => s.aspectPreset)

  const playPreview = useCallback(() => {
    const s = useStore.getState()
    setMotionStartPose({
      cameraPosition: [...s.cameraPosition] as [number, number, number],
      cameraTarget: [...s.cameraTarget] as [number, number, number],
      orbitDistance: s.orbitDistance,
      cameraRoll: s.cameraRoll,
    })
    setAnimationTime(0)
    setAnimationPlayback('playing')
  }, [setAnimationPlayback, setAnimationTime, setMotionStartPose])

  async function exportMotionVideo() {
    if (!cameraMotion) {
      setExportError('No motion preset selected.')
      return
    }
    if (!captureFrame) {
      setExportError('Scene not ready. Wait a moment for the canvas to load.')
      return
    }
    setExporting(true)
    setExportError(null)
    setExportProgress(0)
    try {
      const duration = cameraMotion.durationSec
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
      const viewW = canvas?.clientWidth ?? 800
      const viewH = canvas?.clientHeight ?? 600
      const { w, h } = resolveExportDimensions(aspectPreset, exportPreset, viewW, viewH)
      const blob = await exportCameraMotionVideo({
        captureFrame,
        width: w,
        height: h,
        fps: 30,
        durationSec: duration,
        bgCss: useStore.getState().bgColor,
        bgMode: 'solid' as VideoExportBgMode,
        cameraMotionPresetId: mode === 'preset' ? cameraMotion.presetId : undefined,
        cameraKeyframes: mode === 'keyframes' && cameraKeyframes.length >= 2 ? cameraKeyframes : undefined,
        onProgress: (p) => setExportProgress(Math.round(p.ratio * 100)),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `openmockup-motion-${Date.now()}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Motion export failed', e)
      setExportError(e instanceof Error ? e.message : 'Export failed. Try Chrome/Edge or lower resolution.')
    } finally {
      setExporting(false)
      setExportProgress(0)
    }
  }

  function addKeyframe() {
    const s = useStore.getState()
    const t = s.animationTime
    const next: CameraKeyframe = {
      time: t,
      pose: {
        cameraPosition: [...s.cameraPosition] as [number, number, number],
        cameraTarget: [...s.cameraTarget] as [number, number, number],
        orbitDistance: s.orbitDistance,
        cameraRoll: s.cameraRoll,
      },
    }
    setCameraKeyframes([...cameraKeyframes.filter((k) => Math.abs(k.time - t) > 0.05), next].sort((a, b) => a.time - b.time))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setMode('preset')} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: mode === 'preset' ? 'var(--accent-soft)' : 'transparent', color: 'var(--fg)', cursor: 'pointer' }}>
          Presets
        </button>
        <button type="button" onClick={() => setMode('keyframes')} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: mode === 'keyframes' ? 'var(--accent-soft)' : 'transparent', color: 'var(--fg)', cursor: 'pointer' }}>
          Keyframes
        </button>
      </div>

      {mode === 'preset' && (
        <>
          <select
            value={cameraMotion?.presetId ?? 'hero_sweep'}
            onChange={(e) =>
              setCameraMotion({
                presetId: e.target.value as CameraMotionPresetId,
                durationSec: getPresetDuration(e.target.value),
                loop: false,
              })
            }
            style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', fontSize: 12 }}
          >
            {CAMERA_MOTION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>
            Duration (s)
            <input
              type="range"
              min={2}
              max={15}
              step={0.5}
              value={cameraMotion?.durationSec ?? 5}
              onChange={(e) =>
                setCameraMotion({
                  presetId: (cameraMotion?.presetId ?? 'hero_sweep') as CameraMotionPresetId,
                  durationSec: Number(e.target.value),
                  loop: cameraMotion?.loop ?? false,
                })
              }
              style={{ width: '100%' }}
            />
          </label>
        </>
      )}

      {mode === 'keyframes' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>{cameraKeyframes.length} keyframe(s)</div>
          <button type="button" onClick={addKeyframe} style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer', fontSize: 12 }}>
            Add keyframe at current time
          </button>
          <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>
            Duration (s)
            <input
              type="range"
              min={2}
              max={20}
              step={0.5}
              value={cameraMotion?.durationSec ?? 6}
              onChange={(e) =>
                setCameraMotion({
                  presetId: 'hero_sweep',
                  durationSec: Number(e.target.value),
                  loop: false,
                })
              }
              style={{ width: '100%' }}
            />
          </label>
        </>
      )}

      {exporting && exportProgress > 0 && (
        <div style={{ fontSize: 11, color: 'var(--accent)' }}>Exporting… {exportProgress}%</div>
      )}
      {exportError && (
        <div style={{ fontSize: 11, color: '#f87171', lineHeight: 1.4 }}>{exportError}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: -4 }}>Resolución export</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([1080, 1920] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setExportPreset(p)}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: exportPreset === p ? 'var(--accent-soft)' : 'transparent',
              color: 'var(--fg)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {p === 1080 ? '1080p' : '4K'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={playPreview} disabled={animationPlayback !== 'idle'} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer', fontSize: 12 }}>
          Preview
        </button>
        <button type="button" onClick={exportMotionVideo} disabled={exporting || !cameraMotion} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          {exporting ? 'Exporting…' : 'Export MP4'}
        </button>
      </div>
    </div>
  )
}

function getPresetDuration(id: string): number {
  return CAMERA_MOTION_PRESETS.find((p) => p.id === id)?.defaultDurationSec ?? 5
}
