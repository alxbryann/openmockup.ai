import { useCallback, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { useVideoScreenBridge, getDeviceScreenVideo } from './videoScreenBridge'
import {
  exportVideoFrameByFrame,
  type VideoExportBgMode,
  type VideoExportPreset,
} from './highResVideoExport'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

type VideoTimelineIslandProps = {
  deviceId: string
}

const PRESETS: { label: string; value: VideoExportPreset }[] = [
  { label: 'Pantalla', value: 'screen' },
  { label: '1080p', value: 1920 },
  { label: '4K', value: 3840 },
]

const FPS_OPTIONS = [30, 60] as const

/**
 * Background mode options for video export. Mirror the PNG export so the user
 * gets a consistent "Solid / Verde / Transparente" choice everywhere.
 *
 * The transparent option swaps the output container to WebM (VP9 alpha) since
 * MP4/H.264 cannot carry an alpha channel.
 */
const BG_MODES: {
  value: VideoExportBgMode
  label: string
  format: string
  hint: string
}[] = [
  { value: 'solid', label: 'Actual', format: 'MP4', hint: 'Fondo actual de la escena.' },
  { value: 'green', label: 'Verde', format: 'MP4', hint: 'Pantalla verde · fácil de quitar (chroma key) en cualquier editor.' },
  { value: 'transparent', label: 'Sin fondo', format: 'WebM', hint: 'Video transparente (WebM/VP9 con alpha). Funciona en After Effects, CapCut Pro y en la web.' },
]

export function VideoTimelineIsland({ deviceId }: VideoTimelineIslandProps) {
  const videoStartTime = useStore(
    (s) => s.devices.find((d) => d.id === deviceId)?.videoStartTime ?? 0,
  )
  const videoEndTime = useStore(
    (s) => s.devices.find((d) => d.id === deviceId)?.videoEndTime ?? null,
  )
  const updateDevice = useStore((s) => s.updateDevice)
  const captureFrame = useStore((s) => s.captureSceneToCanvas)
  const bgColor = useStore((s) => s.bgColor)
  const runtime = useVideoScreenBridge((s) => s.runtimeByDevice[deviceId])
  const seek = useVideoScreenBridge((s) => s.seek)
  const setPlaying = useVideoScreenBridge((s) => s.setPlaying)
  const togglePlaying = useVideoScreenBridge((s) => s.togglePlaying)

  const [scrubbing, setScrubbing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportFrame, setExportFrame] = useState(0)
  const [exportTotal, setExportTotal] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const [preset, setPreset] = useState<VideoExportPreset>(1920)
  const [fps, setFps] = useState<30 | 60>(60)
  const [bgMode, setBgMode] = useState<VideoExportBgMode>('solid')
  // Collapsed = minimized pill that only shows play + time, freeing the viewport.
  // Persist across navigations within this tab so the user's choice sticks while
  // they're working on the same scene.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem('openmockup.videoIsland.collapsed') === '1'
    } catch {
      return false
    }
  })
  const abortRef = useRef<AbortController | null>(null)
  const wasPlayingRef = useRef(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem('openmockup.videoIsland.collapsed', next ? '1' : '0')
      } catch { /* sessionStorage disabled */ }
      return next
    })
  }, [])

  // Always force-expand while a render is in progress so the user can see the
  // progress bar and cancel button. Re-collapse is up to them after.
  const effectiveCollapsed = collapsed && !exporting

  const activeBgMode = BG_MODES.find((m) => m.value === bgMode) ?? BG_MODES[0]

  const outputDims = useMemo(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return null
    if (preset === 'screen') return { w: canvas.width, h: canvas.height }
    const aspect = canvas.clientWidth / canvas.clientHeight
    if (aspect >= 1) {
      const w = preset
      const h = Math.max(2, Math.round(preset / aspect))
      return { w: w % 2 === 0 ? w : w - 1, h: h % 2 === 0 ? h : h - 1 }
    }
    const h = preset
    const w = Math.max(2, Math.round(preset * aspect))
    return { w: w % 2 === 0 ? w : w - 1, h: h % 2 === 0 ? h : h - 1 }
  }, [preset])

  const duration = runtime?.duration ?? 0
  const currentTime = runtime?.currentTime ?? 0
  const playing = runtime?.playing ?? false
  const ready = runtime?.ready ?? false

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const startPct = duration > 0 ? (videoStartTime / duration) * 100 : 0
  const endPct = duration > 0 && videoEndTime !== null ? (videoEndTime / duration) * 100 : null
  const hasRange = videoEndTime !== null && videoEndTime > videoStartTime

  const beginScrub = useCallback(() => {
    wasPlayingRef.current = playing
    setScrubbing(true)
    setPlaying(deviceId, false)
  }, [deviceId, playing, setPlaying])

  const endScrub = useCallback(() => {
    setScrubbing(false)
    if (wasPlayingRef.current) setPlaying(deviceId, true)
  }, [deviceId, setPlaying])

  const onSeekInput = useCallback(
    (value: number) => seek(deviceId, value),
    [deviceId, seek],
  )

  const markLoopStart = useCallback(() => {
    updateDevice(deviceId, { videoStartTime: currentTime })
    seek(deviceId, currentTime)
  }, [deviceId, currentTime, seek, updateDevice])

  const markLoopEnd = useCallback(() => {
    updateDevice(deviceId, { videoEndTime: currentTime })
  }, [deviceId, currentTime, updateDevice])

  const clearMarkers = useCallback(() => {
    updateDevice(deviceId, { videoStartTime: 0, videoEndTime: null })
  }, [deviceId, updateDevice])

  const cancelExport = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const exportVideoClip = useCallback(async () => {
    if (!hasRange || !captureFrame) return
    const video = getDeviceScreenVideo(deviceId)
    if (!video) {
      setExportError('Video no disponible')
      return
    }
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) {
      setExportError('Canvas 3D no encontrado')
      return
    }

    setExportError(null)
    setExportProgress(0)
    setExportFrame(0)
    setExportTotal(0)
    setExporting(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await exportVideoFrameByFrame({
        videoElement: video,
        captureFrame,
        bgCss: bgColor,
        bgMode,
        preset,
        canvasElement: canvas,
        fps,
        startTime: videoStartTime,
        endTime: videoEndTime!,
        signal: controller.signal,
        onProgress: ({ frame, totalFrames, ratio }) => {
          setExportFrame(frame)
          setExportTotal(totalFrames)
          setExportProgress(ratio)
        },
      })
    } catch (err) {
      if (controller.signal.aborted) {
        setExportError(null)
      } else {
        setExportError(err instanceof Error ? err.message : 'Error al exportar')
      }
    } finally {
      setExporting(false)
      abortRef.current = null
    }
  }, [hasRange, captureFrame, deviceId, bgColor, bgMode, preset, fps, videoStartTime, videoEndTime])

  if (effectiveCollapsed) {
    // Minimized pill: just play + time + thin progress + expand button.
    // Keeps essential playback control accessible without eating viewport.
    return (
      <div
        className="pointer-events-auto absolute bottom-6 left-1/2 z-[15] -translate-x-1/2"
        role="region"
        aria-label="Video timeline (minimized)"
      >
        <div
          className="flex items-center gap-2.5 rounded-full pl-1.5 pr-3 py-1.5 shadow-2xl"
          style={{
            background: 'rgba(8,6,20,.82)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255,255,255,.14)',
            boxShadow:
              '0 16px 32px rgba(0,0,0,.4), 0 0 0 1px rgba(110,75,255,.12) inset, 0 1px 0 rgba(255,255,255,.08) inset',
          }}
        >
          <button
            type="button"
            onClick={() => togglePlaying(deviceId)}
            disabled={!ready}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'rgba(110,75,255,.4)', color: '#fff' }}
          >
            {playing && !scrubbing ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <div
            className="relative h-[3px] w-[140px] shrink-0 overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,.1)' }}
            aria-hidden
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progress}%`, background: 'var(--accent)' }}
            />
            {hasRange && endPct !== null && (
              <div
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${startPct}%`,
                  width: `${Math.max(0, endPct - startPct)}%`,
                  background: 'rgba(255,100,180,.55)',
                }}
              />
            )}
          </div>

          <span
            className="shrink-0 tabular-nums"
            style={{ font: '500 11px/1 var(--font-sans)', color: 'rgba(255,255,255,.7)' }}
          >
            {formatTime(currentTime)}
            <span style={{ color: 'rgba(255,255,255,.35)' }}> / {formatTime(duration)}</span>
          </span>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expandir controles de video"
            title="Expandir"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.1)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            style={{ color: 'rgba(255,255,255,.55)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 z-[15] w-[min(calc(100%-2rem),440px)] -translate-x-1/2"
      role="region"
      aria-label="Video timeline"
    >
      <div
        className="rounded-[28px] px-4 py-3 shadow-2xl"
        style={{
          background: 'rgba(8,6,20,.82)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255,255,255,.14)',
          boxShadow:
            '0 24px 48px rgba(0,0,0,.45), 0 0 0 1px rgba(110,75,255,.12) inset, 0 1px 0 rgba(255,255,255,.08) inset',
        }}
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <p
            style={{
              font: '600 10px/1 var(--font-sans)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.42)',
              margin: 0,
            }}
          >
            Video
          </p>
          <div className="flex items-center gap-2">
            {!ready && (
              <span style={{ font: '500 11px/1 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}>
                Cargando…
              </span>
            )}
            {exporting && (
              <span style={{ font: '500 10px/1 var(--font-sans)', color: 'rgba(180,160,255,.85)' }}>
                Exportando…
              </span>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              disabled={exporting}
              aria-label="Minimizar controles de video"
              title="Minimizar"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
              onMouseEnter={(e) => { if (!exporting) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.1)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              style={{ color: 'rgba(255,255,255,.55)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Playback row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => togglePlaying(deviceId)}
            disabled={!ready}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'rgba(110,75,255,.35)', color: '#fff' }}
          >
            {playing && !scrubbing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <span
            className="w-9 shrink-0 tabular-nums"
            style={{ font: '500 12px/1 var(--font-sans)', color: 'rgba(255,255,255,.75)' }}
          >
            {formatTime(currentTime)}
          </span>

          {/* Timeline slider with markers */}
          <div className="relative min-w-0 flex-1 py-1">
            {hasRange && endPct !== null && (
              <div
                className="pointer-events-none absolute top-1/2 z-[1] h-1 -translate-y-1/2 rounded-full"
                style={{
                  left: `${startPct}%`,
                  width: `${endPct - startPct}%`,
                  background: 'rgba(110,75,255,.5)',
                }}
              />
            )}
            {duration > 0 && videoStartTime > 0.05 && (
              <div
                className="pointer-events-none absolute top-1/2 z-[2] h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${startPct}%`,
                  background: 'rgba(130,100,255,1)',
                  boxShadow: '0 0 6px rgba(110,75,255,.8)',
                }}
                title={`Inicio: ${formatTime(videoStartTime)}`}
              />
            )}
            {duration > 0 && videoEndTime !== null && (
              <div
                className="pointer-events-none absolute top-1/2 z-[2] h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${endPct}%`,
                  background: 'rgba(255,100,180,1)',
                  boxShadow: '0 0 6px rgba(255,80,160,.8)',
                }}
                title={`Final: ${formatTime(videoEndTime)}`}
              />
            )}
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.01}
              value={duration > 0 ? currentTime : 0}
              disabled={!ready || duration <= 0}
              onPointerDown={beginScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
              onChange={(e) => onSeekInput(Number(e.target.value))}
              className="video-timeline-range relative z-[3] w-full"
              style={{ ['--range-progress' as string]: `${progress}%` }}
              aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
            />
          </div>

          <span
            className="w-9 shrink-0 text-right tabular-nums"
            style={{ font: '500 12px/1 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
          >
            {formatTime(duration)}
          </span>
        </div>

        {/* Markers row */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <p className="m-0" style={{ font: '400 10px/1.35 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}>
              Inicio:{' '}
              <span className="tabular-nums" style={{ color: 'rgba(150,120,255,.9)' }}>
                {formatTime(videoStartTime)}
              </span>
            </p>
            <button
              type="button"
              onClick={markLoopStart}
              disabled={!ready}
              className="cursor-pointer rounded-full border-0 px-2.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                font: '500 10px/1 var(--font-sans)',
                background: 'rgba(110,75,255,.18)',
                color: 'rgba(180,155,255,.9)',
                border: '1px solid rgba(110,75,255,.3)',
              }}
              title="Marca el inicio del clip en el tiempo actual"
            >
              ▶ Marcar inicio aquí
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="m-0" style={{ font: '400 10px/1.35 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}>
              Final:{' '}
              <span
                className="tabular-nums"
                style={{ color: videoEndTime !== null ? 'rgba(255,120,190,.9)' : 'rgba(255,255,255,.28)' }}
              >
                {videoEndTime !== null ? formatTime(videoEndTime) : '—'}
              </span>
            </p>
            <button
              type="button"
              onClick={markLoopEnd}
              disabled={!ready}
              className="cursor-pointer rounded-full border-0 px-2.5 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                font: '500 10px/1 var(--font-sans)',
                background: 'rgba(255,80,160,.15)',
                color: 'rgba(255,160,210,.9)',
                border: '1px solid rgba(255,80,160,.28)',
              }}
              title="Marca el final del clip en el tiempo actual"
            >
              ⏹ Marcar final aquí
            </button>
          </div>
        </div>

        {/* Export section */}
        {hasRange && (
          <div
            className="mt-3 border-t pt-3"
            style={{ borderColor: 'rgba(255,255,255,.08)' }}
          >
            {/* Clip info + clear */}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span style={{ font: '400 11px/1 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}>
                {formatTime(videoStartTime)}
                <span style={{ color: 'rgba(255,255,255,.28)' }}> → </span>
                {formatTime(videoEndTime!)}
                <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 6 }}>
                  ({formatTime(videoEndTime! - videoStartTime)})
                </span>
              </span>
              <button
                type="button"
                onClick={clearMarkers}
                disabled={exporting}
                style={{
                  font: '400 10px/1 var(--font-sans)',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,.3)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                Limpiar
              </button>
            </div>

            {/* Resolution + FPS selectors */}
            <div className="mb-1.5 flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={String(p.value)}
                  type="button"
                  onClick={() => setPreset(p.value)}
                  disabled={exporting}
                  className="flex-1 cursor-pointer rounded-full py-1.5 transition disabled:cursor-not-allowed"
                  style={{
                    font: '500 10px/1 var(--font-sans)',
                    border: preset === p.value
                      ? '1px solid rgba(110,75,255,.7)'
                      : '1px solid rgba(255,255,255,.12)',
                    background: preset === p.value
                      ? 'rgba(110,75,255,.25)'
                      : 'rgba(255,255,255,.05)',
                    color: preset === p.value
                      ? 'rgba(200,180,255,.95)'
                      : 'rgba(255,255,255,.4)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center gap-1.5">
              <div className="flex gap-1.5">
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFps(f)}
                    disabled={exporting}
                    className="cursor-pointer rounded-full px-3 py-1.5 transition disabled:cursor-not-allowed"
                    style={{
                      font: '500 10px/1 var(--font-sans)',
                      border: fps === f
                        ? '1px solid rgba(200,50,180,.7)'
                        : '1px solid rgba(255,255,255,.12)',
                      background: fps === f
                        ? 'rgba(200,50,180,.2)'
                        : 'rgba(255,255,255,.05)',
                      color: fps === f
                        ? 'rgba(255,160,230,.95)'
                        : 'rgba(255,255,255,.4)',
                    }}
                  >
                    {f} fps
                  </button>
                ))}
              </div>
              {outputDims && (
                <span
                  className="ml-auto tabular-nums"
                  style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.28)' }}
                >
                  {outputDims.w}×{outputDims.h}
                </span>
              )}
            </div>

            {/* Background mode (solid / green / transparent) */}
            <p
              className="mb-1"
              style={{
                font: '600 9px/1 var(--font-sans)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,.35)',
              }}
            >
              Fondo
            </p>
            <div className="mb-1 flex gap-1.5">
              {BG_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => { setBgMode(m.value); setExportError(null) }}
                  disabled={exporting}
                  className="flex-1 cursor-pointer rounded-full py-1.5 transition disabled:cursor-not-allowed"
                  style={{
                    font: '500 10px/1 var(--font-sans)',
                    border: bgMode === m.value
                      ? '1px solid rgba(110,75,255,.7)'
                      : '1px solid rgba(255,255,255,.12)',
                    background: bgMode === m.value
                      ? 'rgba(110,75,255,.25)'
                      : 'rgba(255,255,255,.05)',
                    color: bgMode === m.value
                      ? 'rgba(200,180,255,.95)'
                      : 'rgba(255,255,255,.4)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p
              className="mb-2.5"
              style={{ font: '400 10px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.42)' }}
            >
              {activeBgMode.hint}
            </p>

            {/* Progress bar */}
            {exporting && (
              <div className="mb-2.5">
                <div
                  className="mb-1 overflow-hidden rounded-full"
                  style={{ height: 4, background: 'rgba(255,255,255,.08)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${exportProgress * 100}%`,
                      background: 'linear-gradient(90deg, rgba(110,75,255,1), rgba(200,50,180,1))',
                    }}
                  />
                </div>
                <p
                  className="text-center"
                  style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.4)', margin: 0 }}
                >
                  Frame {exportFrame} / {exportTotal}
                  {exportTotal > 0 && (
                    <span style={{ color: 'rgba(255,255,255,.25)', marginLeft: 6 }}>
                      ({Math.round(exportProgress * 100)}%)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Export / Cancel button */}
            {exporting ? (
              <button
                type="button"
                onClick={cancelExport}
                className="w-full cursor-pointer py-2.5 transition"
                style={{
                  background: 'rgba(255,255,255,.07)',
                  color: 'rgba(255,255,255,.6)',
                  borderRadius: 12,
                  font: '600 13px/1 var(--font-sans)',
                  border: '1px solid rgba(255,255,255,.12)',
                }}
              >
                Cancelar exportación
              </button>
            ) : (
              <button
                type="button"
                onClick={exportVideoClip}
                disabled={!ready || !captureFrame}
                className="w-full cursor-pointer py-2.5 transition enabled:hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(110,75,255,.85), rgba(200,50,180,.75))',
                  color: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 4px 16px -4px rgba(110,75,255,.55)',
                  font: '600 13px/1 var(--font-sans)',
                  border: '1px solid rgba(130,80,255,.4)',
                }}
              >
                ↓ Exportar video ({activeBgMode.format})
              </button>
            )}

            {exportError && (
              <p
                className="mt-2 text-center text-xs leading-relaxed"
                style={{ color: 'rgba(255,160,80,.9)' }}
              >
                {exportError}
              </p>
            )}

            {!exporting && (
              <p
                className="mt-1.5 text-center"
                style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.25)' }}
              >
                Frame a frame · {bgMode === 'transparent' ? 'VP9 alpha' : 'H.264'} · {fps} fps · alta calidad
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
