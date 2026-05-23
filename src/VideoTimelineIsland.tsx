import { useCallback, useRef, useState } from 'react'
import { useStore } from './store'
import { useVideoScreenBridge } from './videoScreenBridge'

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

export function VideoTimelineIsland({ deviceId }: VideoTimelineIslandProps) {
  const videoStartTime = useStore(
    (s) => s.devices.find((d) => d.id === deviceId)?.videoStartTime ?? 0,
  )
  const updateDevice = useStore((s) => s.updateDevice)
  const runtime = useVideoScreenBridge((s) => s.runtimeByDevice[deviceId])
  const seek = useVideoScreenBridge((s) => s.seek)
  const setPlaying = useVideoScreenBridge((s) => s.setPlaying)
  const togglePlaying = useVideoScreenBridge((s) => s.togglePlaying)

  const [scrubbing, setScrubbing] = useState(false)
  const wasPlayingRef = useRef(false)

  const duration = runtime?.duration ?? 0
  const currentTime = runtime?.currentTime ?? 0
  const playing = runtime?.playing ?? false
  const ready = runtime?.ready ?? false

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const startPct = duration > 0 ? (videoStartTime / duration) * 100 : 0

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
    (value: number) => {
      seek(deviceId, value)
    },
    [deviceId, seek],
  )

  const markLoopStart = useCallback(() => {
    updateDevice(deviceId, { videoStartTime: currentTime })
    seek(deviceId, currentTime)
  }, [deviceId, currentTime, seek, updateDevice])

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 z-[15] w-[min(calc(100%-2rem),420px)] -translate-x-1/2"
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
          {!ready && (
            <span style={{ font: '500 11px/1 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}>
              Cargando…
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => togglePlaying(deviceId)}
            disabled={!ready}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: 'rgba(110,75,255,.35)',
              color: '#fff',
            }}
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

          <div className="relative min-w-0 flex-1 py-1">
            {/* Loop start marker */}
            {duration > 0 && videoStartTime > 0.05 && (
              <div
                className="pointer-events-none absolute top-1/2 z-[1] h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${startPct}%`,
                  background: 'rgba(110,75,255,.95)',
                  boxShadow: '0 0 8px rgba(110,75,255,.6)',
                }}
                title={`Inicio del loop: ${formatTime(videoStartTime)}`}
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
              className="video-timeline-range relative z-[2] w-full"
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

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p
            className="m-0"
            style={{ font: '400 11px/1.35 var(--font-sans)', color: 'rgba(255,255,255,.5)' }}
          >
            Inicio del loop:{' '}
            <span className="tabular-nums" style={{ color: 'rgba(255,255,255,.8)' }}>
              {formatTime(videoStartTime)}
            </span>
          </p>
          <button
            type="button"
            onClick={markLoopStart}
            disabled={!ready}
            className="cursor-pointer rounded-full border-0 px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              font: '500 11px/1 var(--font-sans)',
              background: 'rgba(255,255,255,.08)',
              color: 'rgba(255,255,255,.75)',
            }}
            title="El video volverá a este punto al terminar"
          >
            Marcar inicio aquí
          </button>
        </div>

        {/* Progress hint (non-interactive) */}
        <div
          className="pointer-events-none absolute inset-x-4 bottom-[52px] h-0.5 overflow-hidden rounded-full opacity-0"
          aria-hidden
          style={{ width: `calc(100% - 2rem)` }}
        >
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  )
}
