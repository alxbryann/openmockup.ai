import { useEffect, useRef, useState } from 'react'
import { exportPixelSize } from './highResCapture'
import {
  Scene,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  ORBIT_ZOOM_REF_DISTANCE,
} from './Scene'
import { useStore, type DeviceKind } from './store'

const DEVICE_OPTIONS: { id: DeviceKind; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'mac', label: 'Mac' },
]

type ExportPreset = 'screen' | 1920 | 3840 | 7680

const EXPORT_PRESETS: { id: ExportPreset; label: string; hint: string }[] = [
  { id: 'screen', label: 'Screen', hint: 'fast, viewport size' },
  { id: 1920, label: '1080p', hint: 'long edge 1920 px' },
  { id: 3840, label: '4K', hint: 'long edge 3840 px' },
  { id: 7680, label: '8K', hint: 'long edge 7680 px' },
]

const DEVICE_SWATCHES = [
  '#1d1d1f',
  '#ebebed',
  '#bfbdb8',
  '#404a57',
  '#c9b8a2',
  '#e2e3e5',
] as const
const BG_SWATCHES = ['#0a0a0a', '#ffffff', '#0f172a', '#14532d', '#5c4033', '#f4f4f5'] as const

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const {
    devices,
    activeDeviceId,
    bgColor,
    autoRotate,
    uiTheme,
    cameraRoll,
    orbitDistance,
    addDevice,
    removeDevice,
    setActiveDeviceId,
    updateDevice,
    setDeviceRotationAxis,
    resetDeviceRotation,
    deviceDragMode,
    setDeviceDragMode,
    setBgColor,
    setAutoRotate,
    setUiTheme,
    setCameraRoll,
    setCameraPanFree,
  } = useStore()

  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? devices[0]
  const { screenshot, screenLoadError, deviceKind, deviceColor, deviceRotation } = activeDevice

  const [exporting, setExporting] = useState(false)
  const [exportPreset, setExportPreset] = useState<ExportPreset>(3840)
  const [exportTransparentBg, setExportTransparentBg] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme
  }, [uiTheme])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (k === 'h') {
        e.preventDefault()
        setCameraPanFree(true)
        return
      }
      if (k === 'v') {
        e.preventDefault()
        setCameraPanFree(false)
        return
      }
      if (k === '[') {
        e.preventDefault()
        setSidePanelOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCameraPanFree])

  const zoomFactor = ORBIT_ZOOM_REF_DISTANCE / orbitDistance
  const zoomLabel = `${parseFloat(zoomFactor.toFixed(1))}×`
  const zoomRangeLo = parseFloat((ORBIT_ZOOM_REF_DISTANCE / ORBIT_MAX_DISTANCE).toFixed(1))
  const zoomRangeHi = parseFloat((ORBIT_ZOOM_REF_DISTANCE / ORBIT_MIN_DISTANCE).toFixed(1))

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    updateDevice(activeDevice.id, { screenLoadError: null })

    const isHeic =
      /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)

    try {
      let dataUrl: string
      if (isHeic) {
        const heic2any = (await import('heic2any')).default
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.92,
        })
        const blob = Array.isArray(converted) ? converted[0] : converted
        dataUrl = await readBlobAsDataUrl(blob)
      } else {
        dataUrl = await readFileAsDataUrl(file)
      }
      updateDevice(activeDevice.id, { screenshot: dataUrl })
    } catch (err) {
      console.error(err)
      updateDevice(activeDevice.id, {
        screenLoadError: isHeic
          ? 'Could not convert HEIC. Export the screenshot as JPEG or PNG and try again.'
          : 'Could not read the file.',
      })
    }
  }

  function exportPNG() {
    setExportError(null)
    setExporting(true)
    requestAnimationFrame(() => {
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
        if (!canvas) {
          setExportError('3D canvas not found.')
          return
        }
        const capture = useStore.getState().captureSceneAtSize
        let dataUrl: string
        const needOffscreen = exportTransparentBg || exportPreset !== 'screen'
        if (needOffscreen) {
          if (!capture) {
            setExportError('Scene not ready. Wait a moment and try again.')
            return
          }
          const { w, h } =
            exportPreset === 'screen'
              ? { w: canvas.width, h: canvas.height }
              : exportPixelSize(exportPreset, canvas.clientWidth, canvas.clientHeight)
          const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
          if (gl) {
            const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
            if (w > maxTex || h > maxTex) {
              setExportError(`This GPU supports at most ${maxTex}px per side. Pick another resolution.`)
              return
            }
          }
          dataUrl = capture(w, h, exportTransparentBg ? { transparent: true } : undefined)
        } else {
          dataUrl = canvas.toDataURL('image/png')
        }
        const link = document.createElement('a')
        link.download = `mockit-${Date.now()}.png`
        link.href = dataUrl
        link.click()
      } catch (err) {
        console.error(err)
        setExportError('Export failed. Try "Screen" or a lower resolution.')
      } finally {
        setExporting(false)
      }
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col" style={{ background: 'var(--mockit-bg)' }}>
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b px-5"
        style={{ borderColor: 'var(--mockit-nav-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <PhoneGlyph className="h-[22px] w-[22px] shrink-0 text-[var(--mockit-accent-bright)]" />
          <span
            className="text-[1.15rem] font-light lowercase tracking-tight"
            style={{ color: 'var(--mockit-text)' }}
          >
            mockit
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSidePanelOpen((o) => !o)}
            aria-pressed={sidePanelOpen}
            aria-label={sidePanelOpen ? 'Hide options panel' : 'Show options panel'}
            title={sidePanelOpen ? 'Hide panel — [ key' : 'Show panel — [ key'}
            className="flex cursor-pointer rounded-lg border-0 bg-transparent p-2 transition hover:bg-[color-mix(in_srgb,var(--mockit-text)_8%,transparent)]"
            style={{ color: 'var(--mockit-text-muted)' }}
          >
            <PanelSidebarGlyph className="h-5 w-5 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
            className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0"
            aria-label={uiTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span className="mockit-toggle" data-on={uiTheme === 'light'}>
              <span className="mockit-toggle-thumb" />
            </span>
            <span className="font-script text-[1.35rem] leading-none" style={{ color: 'var(--mockit-script)' }}>
              {uiTheme === 'dark' ? 'light' : 'dark'}
            </span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <Scene />

        <div
          className="pointer-events-none absolute top-3 left-3 z-[5] rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md md:top-4 md:left-4"
          style={{
            background: 'color-mix(in srgb, var(--mockit-panel) 90%, transparent)',
            borderColor: 'var(--mockit-panel-border)',
            boxShadow: 'var(--mockit-shadow)',
          }}
          role="status"
          aria-live="polite"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mockit-text-muted)' }}>
            Zoom
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--mockit-text)' }}>
            {zoomLabel}
          </p>
          <p className="text-[10px] tabular-nums opacity-80" style={{ color: 'var(--mockit-text-muted)' }}>
            {zoomRangeLo}–{zoomRangeHi}×
          </p>
        </div>

        <aside
          className={`absolute top-1/2 right-4 z-10 w-[min(100%-1.5rem,300px)] max-h-[calc(100%-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-xl transition-[transform,opacity] duration-300 ease-out md:right-6 md:w-[min(100%-3rem,320px)] ${
            sidePanelOpen
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-[calc(100%+2rem)] opacity-0'
          }`}
          style={{
            background: 'var(--mockit-panel)',
            borderColor: 'var(--mockit-panel-border)',
            boxShadow: 'var(--mockit-shadow)',
          }}
          aria-hidden={!sidePanelOpen}
        >
          <div className="mb-4 flex justify-end border-b pb-3" style={{ borderColor: 'var(--mockit-panel-border)' }}>
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-xs opacity-80 transition hover:opacity-100"
              style={{ color: 'var(--mockit-text-muted)' }}
              aria-label="Hide options panel"
              title="Hide panel — [ key"
            >
              <span>Hide</span>
              <ChevronRightGlyph className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          </div>

          <div className="flex flex-col gap-5">

            {/* Device selector */}
            <Field label="Devices">
              <div className="flex flex-wrap items-center gap-1.5">
                {devices.map((d, i) => {
                  const isActive = d.id === activeDeviceId
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setActiveDeviceId(d.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                        isActive
                          ? 'border-[var(--mockit-accent-bright)] bg-[var(--mockit-accent)]/15 text-[var(--mockit-text)]'
                          : 'border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50'
                      }`}
                      style={{ color: isActive ? undefined : 'var(--mockit-text-muted)' }}
                    >
                      {i + 1}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => addDevice('phone')}
                  title="Add iPhone"
                  className="rounded-lg border px-3 py-1.5 text-xs transition border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50"
                  style={{ color: 'var(--mockit-text-muted)' }}
                >
                  + Phone
                </button>
                <button
                  type="button"
                  onClick={() => addDevice('mac')}
                  title="Add MacBook"
                  className="rounded-lg border px-3 py-1.5 text-xs transition border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50"
                  style={{ color: 'var(--mockit-text-muted)' }}
                >
                  + Mac
                </button>
              </div>
              {/* Rotate / Move toggle */}
              <div className="mt-2 flex items-center gap-1.5">
                {(['rotate', 'move'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDeviceDragMode(mode)}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${
                      deviceDragMode === mode
                        ? 'border-[var(--mockit-accent-bright)] bg-[var(--mockit-accent)]/15 text-[var(--mockit-text)]'
                        : 'border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50'
                    }`}
                    style={{ color: deviceDragMode === mode ? undefined : 'var(--mockit-text-muted)' }}
                  >
                    {mode === 'rotate' ? <RotateGlyph className="h-3 w-3 shrink-0" /> : <MoveGlyph className="h-3 w-3 shrink-0" />}
                    {mode === 'rotate' ? 'Rotate' : 'Move'}
                  </button>
                ))}
              </div>

              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDevice(activeDevice.id)}
                  className="mt-1.5 text-[11px] opacity-60 hover:opacity-100 transition border-0 bg-transparent p-0 cursor-pointer"
                  style={{ color: 'var(--mockit-text-muted)' }}
                >
                  Remove device {devices.findIndex((d) => d.id === activeDeviceId) + 1}
                </button>
              )}
            </Field>

            {/* Screenshot for active device */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-7 transition hover:border-[var(--mockit-accent)] hover:bg-[var(--mockit-accent)]/5"
              style={{ borderColor: 'var(--mockit-upload-dash)' }}
            >
              <span className="font-script text-[1.35rem]" style={{ color: 'var(--mockit-script)' }}>
                {screenshot ? '+ replace screenshot' : '+ upload screenshot'}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUpload}
            />

            {screenshot && (
              <button
                type="button"
                onClick={() => updateDevice(activeDevice.id, { screenshot: null, screenLoadError: null })}
                className="font-script -mt-2 self-center text-base opacity-70 hover:opacity-100"
                style={{ color: 'var(--mockit-script)' }}
              >
                Clear
              </button>
            )}
            {screenLoadError && (
              <p className="text-xs leading-relaxed text-amber-600 dark:text-amber-400/90">{screenLoadError}</p>
            )}

            <Field label="Device type">
              <div className="flex flex-wrap gap-1.5">
                {DEVICE_OPTIONS.map(({ id, label }) => {
                  const on = deviceKind === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        updateDevice(activeDevice.id, { deviceKind: id })
                        resetDeviceRotation(activeDevice.id)
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs transition ${
                        on
                          ? 'border-[var(--mockit-accent-bright)] bg-[var(--mockit-accent)]/15 text-[var(--mockit-text)]'
                          : 'border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Device color">
              <ColorRow
                value={deviceColor}
                onChange={(c) => updateDevice(activeDevice.id, { deviceColor: c })}
                swatches={[...DEVICE_SWATCHES]}
              />
            </Field>

            {devices.length > 1 && (
              <Field label="Position X">
                <label className="flex items-center gap-3 text-xs" style={{ color: 'var(--mockit-text-muted)' }}>
                  <span className="w-12 shrink-0 tabular-nums">
                    {activeDevice.positionX > 0 ? '+' : ''}{Math.round(activeDevice.positionX)}
                  </span>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={0.5}
                    value={activeDevice.positionX}
                    onChange={(e) => updateDevice(activeDevice.id, { positionX: Number(e.target.value) })}
                    className="min-w-0 flex-1 accent-[var(--mockit-accent-bright)]"
                  />
                </label>
              </Field>
            )}

            <Field label="Background">
              <ColorRow value={bgColor} onChange={setBgColor} swatches={[...BG_SWATCHES]} />
            </Field>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-script text-[1.25rem]" style={{ color: 'var(--mockit-script)' }}>
                  auto-rotate
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRotate}
                  onClick={() => setAutoRotate(!autoRotate)}
                  className="border-0 bg-transparent p-0"
                >
                  <span className="mockit-toggle" data-on={autoRotate}>
                    <span className="mockit-toggle-thumb" />
                  </span>
                </button>
              </div>
              <p className="text-[11px] leading-snug opacity-75" style={{ color: 'var(--mockit-text-muted)' }}>
                Slowly spins all devices (Y / turntable).
              </p>
            </div>

            <Field label="Camera roll">
              <p className="mb-2 font-script text-[0.95rem] leading-snug opacity-80" style={{ color: 'var(--mockit-script)' }}>
                Roll the view around the camera axis. Right-drag orbits; roll applies on top.
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(
                  [
                    { rad: 0, label: '0°' },
                    { rad: Math.PI / 2, label: '90°' },
                    { rad: Math.PI, label: '180°' },
                    { rad: -Math.PI / 2, label: '270°' },
                  ] as const
                ).map(({ rad, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCameraRoll(rad)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                      Math.abs(cameraRoll - rad) < 0.02
                        ? 'border-[var(--mockit-accent-bright)] bg-[var(--mockit-accent)]/15 text-[var(--mockit-text)]'
                        : 'border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-3 text-xs" style={{ color: 'var(--mockit-text-muted)' }}>
                <span className="w-12 shrink-0 tabular-nums">
                  {Math.round((cameraRoll * 180) / Math.PI)}°
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={Math.round((cameraRoll * 180) / Math.PI)}
                  onChange={(e) => setCameraRoll((Number(e.target.value) * Math.PI) / 180)}
                  className="min-w-0 flex-1 accent-[var(--mockit-accent-bright)]"
                />
              </label>
            </Field>

            <Field label="Device rotation">
              <p className="mb-2 font-script text-[0.95rem] leading-snug opacity-80" style={{ color: 'var(--mockit-script)' }}>
                Euler XYZ for device {devices.findIndex((d) => d.id === activeDeviceId) + 1}. Left-drag to adjust; Shift+drag for Z.
              </p>
              {(
                [
                  { axis: 0 as const, title: 'X axis', hint: 'front ↔ back' },
                  { axis: 1 as const, title: 'Y axis', hint: 'turntable' },
                  { axis: 2 as const, title: 'Z axis', hint: 'side tilt' },
                ] as const
              ).map(({ axis, title, hint }) => {
                const rad = deviceRotation[axis]
                const deg = Math.round((rad * 180) / Math.PI)
                return (
                  <label
                    key={axis}
                    className="mb-3 flex flex-col gap-1 text-xs last:mb-0"
                    style={{ color: 'var(--mockit-text-muted)' }}
                  >
                    <span>
                      <span className="font-medium" style={{ color: 'var(--mockit-text)' }}>
                        {title}
                      </span>
                      <span className="opacity-80"> — {hint}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="w-12 shrink-0 tabular-nums">{deg}°</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={deg}
                        onChange={(e) =>
                          setDeviceRotationAxis(
                            activeDevice.id,
                            axis,
                            (Number(e.target.value) * Math.PI) / 180,
                          )
                        }
                        className="min-w-0 flex-1 accent-[var(--mockit-accent-bright)]"
                      />
                    </span>
                  </label>
                )
              })}
              <button
                type="button"
                onClick={() => resetDeviceRotation(activeDevice.id)}
                className="mt-2 rounded-lg border px-2.5 py-1 text-xs transition border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50"
                style={{ color: 'var(--mockit-text-muted)' }}
              >
                Reset XYZ
              </button>
            </Field>

            <div className="pt-1">
              <p
                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'var(--mockit-text-muted)' }}
              >
                Export resolution
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {EXPORT_PRESETS.map(({ id, label }) => {
                  const on = exportPreset === id
                  return (
                    <button
                      key={String(id)}
                      type="button"
                      onClick={() => {
                        setExportPreset(id)
                        setExportError(null)
                      }}
                      className={`rounded-lg border px-2 py-2 text-xs transition ${
                        on
                          ? 'border-[var(--mockit-accent-bright)] bg-[var(--mockit-accent)]/15 text-[var(--mockit-text)]'
                          : 'border-[color-mix(in_srgb,var(--mockit-text)_18%,transparent)] hover:border-[var(--mockit-accent)]/50'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="mb-3 text-[11px] leading-snug opacity-80" style={{ color: 'var(--mockit-text-muted)' }}>
                {EXPORT_PRESETS.find((p) => p.id === exportPreset)?.hint}. Same framing as the viewport; lossless PNG.
              </p>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--mockit-text-muted)' }}>
                  No background
                  <span className="mt-0.5 block text-[10px] leading-snug opacity-80">
                    Transparent PNG (no solid color)
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={exportTransparentBg}
                  onClick={() => {
                    setExportTransparentBg((v) => !v)
                    setExportError(null)
                  }}
                  className="border-0 bg-transparent p-0"
                >
                  <span className="mockit-toggle" data-on={exportTransparentBg}>
                    <span className="mockit-toggle-thumb" />
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={exportPNG}
                disabled={exporting}
                className="w-full cursor-pointer rounded-xl py-3.5 text-[15px] font-bold tracking-wide text-slate-900 italic transition enabled:hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'var(--mockit-accent-bright)',
                  boxShadow: '0 0 28px rgba(34, 211, 238, 0.28)',
                }}
              >
                {exporting ? 'Exporting…' : 'Export PNG'}
              </button>
              {exportError && (
                <p className="mt-2 text-center text-xs leading-relaxed text-amber-600 dark:text-amber-400/90">
                  {exportError}
                </p>
              )}
              <p className="mt-2 font-script text-center text-[0.95rem] opacity-70" style={{ color: 'var(--mockit-script)' }}>
                No watermark — reframe before export
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function PhoneGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="6.5" y="3" width="11" height="18" rx="2.2" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="12" cy="17.25" r="0.55" fill="currentColor" />
    </svg>
  )
}

function PanelSidebarGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function ChevronRightGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function RotateGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.5 2v6h-6" />
      <path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
    </svg>
  )
}

function MoveGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: 'var(--mockit-text-muted)' }}
      >
        {label}
      </h2>
      {children}
    </div>
  )
}

function ColorRow({
  value,
  onChange,
  swatches,
}: {
  value: string
  onChange: (v: string) => void
  swatches: readonly string[] | string[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((s) => {
        const selected = value.toLowerCase() === s.toLowerCase()
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`h-8 w-8 rounded-full border-2 transition ${
              selected
                ? 'scale-105 border-[var(--mockit-accent-bright)] shadow-[0_0_14px_rgba(34,211,238,0.4)]'
                : 'border-[color-mix(in_srgb,var(--mockit-text)_22%,transparent)] hover:border-[var(--mockit-accent)]/55'
            }`}
            style={{ background: s }}
            aria-label={`Color ${s}`}
          />
        )
      })}
    </div>
  )
}
