import { useCallback, useEffect, useRef, useState } from 'react'
import { exportPixelSize } from './highResCapture'
import {
  Scene,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  ORBIT_ZOOM_REF_DISTANCE,
} from './Scene'
import { useStore, type DeviceKind } from './store'
import { GRADIENT_PRESETS } from './gradients'
import { projectStore, snapshotFromStoreState, type Project } from './projectStore'
import { ProjectPicker } from './ProjectPicker'

type AppProps = { initialProjectId?: string | null }

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

const DEVICE_COLOR_GROUPS: { label: string; colors: { hex: string; name: string }[] }[] = [
  {
    label: 'iPhone 17',
    colors: [
      { hex: '#DFCEEA', name: 'Lavanda' },
      { hex: '#96AED1', name: 'Mist Blue' },
      { hex: '#A9B689', name: 'Sage' },
      { hex: '#353839', name: 'Negro' },
      { hex: '#F5F5F5', name: 'Blanco' },
    ],
  },
  {
    label: 'iPhone 17 Air',
    colors: [
      { hex: '#F0F9FF', name: 'Sky Blue' },
      { hex: '#FFFCF5', name: 'Light Gold' },
      { hex: '#000000', name: 'Space Black' },
      { hex: '#FCFCFC', name: 'Cloud White' },
    ],
  },
  {
    label: 'iPhone 17 Pro / Pro Max',
    colors: [
      { hex: '#32374A', name: 'Deep Blue' },
      { hex: '#F77E2D', name: 'Cosmic Orange' },
      { hex: '#F5F5F5', name: 'Silver' },
    ],
  },
]
const BG_SWATCHES = ['#0a0a0a', '#ffffff', '#0f172a', '#14532d', '#5c4033', '#f4f4f5'] as const

export default function App({ initialProjectId = null }: AppProps = {}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const sceneHostRef = useRef<HTMLDivElement>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
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
    hydrateFromSnapshot,
  } = useStore()

  const cameraPosition = useStore((s) => s.cameraPosition)
  const cameraTarget = useStore((s) => s.cameraTarget)
  const viewportAspect = useStore((s) => s.viewportAspect)
  const viewportInsetRight = useStore((s) => s.viewportInsetRight)
  const setViewportAspect = useStore((s) => s.setViewportAspect)
  const setViewportInsetRight = useStore((s) => s.setViewportInsetRight)

  // Track the scene canvas aspect ratio so the embed can reproduce the same framing.
  useEffect(() => {
    const el = sceneHostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        const aspect = Math.round((r.width / r.height) * 1000) / 1000
        if (aspect !== useStore.getState().viewportAspect) {
          setViewportAspect(aspect)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setViewportAspect])

  // Track how much of the canvas width is covered by the side panel overlay.
  // The embed uses this to reproduce the same effective framing.
  useEffect(() => {
    const host = sceneHostRef.current
    if (!host) return
    const aside = host.querySelector('aside')
    if (!sidePanelOpen || !aside) {
      if (useStore.getState().viewportInsetRight !== 0) setViewportInsetRight(0)
      return
    }
    function measure() {
      const hostRect = host!.getBoundingClientRect()
      const asideRect = (aside as HTMLElement).getBoundingClientRect()
      if (hostRect.width <= 0) return
      // Distance from the host's right edge to the aside's left edge, as a fraction of host width.
      const insetPx = Math.max(0, hostRect.right - asideRect.left)
      const fraction = Math.round((insetPx / hostRect.width) * 1000) / 1000
      if (fraction !== useStore.getState().viewportInsetRight) {
        setViewportInsetRight(fraction)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    ro.observe(aside as HTMLElement)
    return () => ro.disconnect()
  }, [sidePanelOpen, setViewportInsetRight])

  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const projectReadyRef = useRef(false)

  // Load (or create) the active project once, on mount.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const id = initialProjectId ?? projectStore.getLastOpenedId()
      let project = id ? await projectStore.get(id) : null
      if (!project) {
        project = await projectStore.create()
      }
      if (cancelled) return
      hydrateFromSnapshot(project.snapshot)
      setActiveProject(project)
      projectStore.setLastOpenedId(project.id)
      // Reflect project id in URL without reloading
      const q = new URLSearchParams(location.search)
      if (q.get('project') !== project.id) {
        q.set('studio', '')
        q.set('project', project.id)
        history.replaceState(null, '', `?${q.toString().replace('studio=&', 'studio&')}`)
      }
      // Give hydrate time to settle before autosave starts.
      requestAnimationFrame(() => {
        projectReadyRef.current = true
      })
    }
    bootstrap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave (debounced) whenever any persisted slice of the store changes.
  useEffect(() => {
    if (!activeProject || !projectReadyRef.current) return
    const snapshot = snapshotFromStoreState({ devices, bgColor, uiTheme, cameraRoll, orbitDistance, autoRotate, cameraPosition, cameraTarget, viewportAspect, viewportInsetRight })
    const handle = window.setTimeout(() => {
      projectStore
        .save(activeProject.id, { snapshot })
        .then((p) => setActiveProject(p))
        .catch((e) => console.error('autosave failed', e))
    }, 600)
    return () => window.clearTimeout(handle)
  }, [activeProject, devices, bgColor, uiTheme, cameraRoll, orbitDistance, autoRotate, cameraPosition, cameraTarget, viewportAspect, viewportInsetRight])

  const switchToProject = useCallback(
    async (id: string) => {
      const p = await projectStore.get(id)
      if (!p) return
      projectReadyRef.current = false
      hydrateFromSnapshot(p.snapshot)
      setActiveProject(p)
      projectStore.setLastOpenedId(p.id)
      setPickerOpen(false)
      const q = new URLSearchParams(location.search)
      q.set('project', p.id)
      history.replaceState(null, '', `?${q.toString()}`)
      requestAnimationFrame(() => {
        projectReadyRef.current = true
      })
    },
    [hydrateFromSnapshot],
  )

  const createAndOpen = useCallback(async () => {
    projectReadyRef.current = false
    const p = await projectStore.create()
    hydrateFromSnapshot(p.snapshot)
    setActiveProject(p)
    projectStore.setLastOpenedId(p.id)
    setPickerOpen(false)
    const q = new URLSearchParams(location.search)
    q.set('project', p.id)
    history.replaceState(null, '', `?${q.toString()}`)
    requestAnimationFrame(() => {
      projectReadyRef.current = true
    })
  }, [hydrateFromSnapshot])

  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? devices[0]
  const { screenshot, screenLoadError, deviceKind, deviceColor, deviceRotation } = activeDevice

  const [exporting, setExporting] = useState(false)
  const [exportPreset, setExportPreset] = useState<ExportPreset>(3840)
  const [exportTransparentBg, setExportTransparentBg] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [studioReady, setStudioReady] = useState(false)
  const mountTimeRef = useRef(Date.now())

  const handleSceneReady = useCallback(() => {
    const elapsed = Date.now() - mountTimeRef.current
    const delay = Math.max(0, 350 - elapsed)
    setTimeout(() => setStudioReady(true), delay)
  }, [])

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
          dataUrl = capture(w, h, exportTransparentBg ? { transparent: true } : { bgCss: bgColor })
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
      {/* Studio loading splash */}
      <div className="mockit-loading-overlay" data-hidden={studioReady ? 'true' : 'false'}>
        <svg viewBox="0 0 40 40" width={52} height={52} style={{ flexShrink: 0 }} aria-hidden>
          <defs>
            <radialGradient id="ldr-main" cx="35%" cy="30%" r="70%">
              <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
              <stop offset=".4" stopColor="#c5b3ff" />
              <stop offset="1" stopColor="#6e4bff" />
            </radialGradient>
            <radialGradient id="ldr-blush" cx="65%" cy="65%" r="60%">
              <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
              <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="20" cy="20" r="17" fill="url(#ldr-main)" />
          <circle cx="20" cy="20" r="17" fill="url(#ldr-blush)" />
          <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
        </svg>
        <div className="mockit-spinner" />
        <p style={{ font: '500 13px/1 var(--font-sans)', color: 'rgba(255,255,255,.35)', margin: 0, letterSpacing: '0.01em' }}>
          Loading studio…
        </p>
      </div>
      {/* Header */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b px-5"
        style={{
          background: 'rgba(10,6,26,.7)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          borderColor: 'rgba(255,255,255,.1)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* PhoneGlyph kept for future use */}
          <PhoneGlyph className="hidden" aria-hidden />
          {/* OpenMockup orb logo */}
          <svg viewBox="0 0 40 40" width={30} height={30} style={{ flexShrink: 0 }} aria-hidden>
            <defs>
              <radialGradient id="orb-main" cx="35%" cy="30%" r="70%">
                <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
                <stop offset=".4" stopColor="#c5b3ff" />
                <stop offset="1" stopColor="#6e4bff" />
              </radialGradient>
              <radialGradient id="orb-blush" cx="65%" cy="65%" r="60%">
                <stop offset="0" stopColor="#ff7eb6" stopOpacity=".8" />
                <stop offset="1" stopColor="#ff7eb6" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="20" cy="20" r="17" fill="url(#orb-main)" />
            <circle cx="20" cy="20" r="17" fill="url(#orb-blush)" />
            <ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".55" />
          </svg>
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '-0.02em',
              color: 'rgba(255,255,255,.9)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            openmockup<span style={{ color: 'var(--accent)' }}>.ai</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="Switch project"
            title="Switch project"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 transition"
            style={{ color: 'rgba(255,255,255,.7)', font: '500 13px/1 var(--font-sans)', letterSpacing: '-0.005em' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.08)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round" />
            </svg>
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProject?.name ?? 'Loading…'}
            </span>
            <span style={{ opacity: 0.4 }}>▾</span>
          </button>
          <button
            type="button"
            onClick={() => setSidePanelOpen((o) => !o)}
            aria-pressed={sidePanelOpen}
            aria-label={sidePanelOpen ? 'Hide options panel' : 'Show options panel'}
            title={sidePanelOpen ? 'Hide panel — [ key' : 'Show panel — [ key'}
            className="flex cursor-pointer rounded-lg border-0 bg-transparent p-2 transition"
            style={{ color: 'rgba(255,255,255,.5)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.08)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
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
          </button>
        </div>
      </header>

      <div ref={sceneHostRef} className="relative min-h-0 flex-1">
        <Scene onReady={handleSceneReady} />

        {/* Zoom badge */}
        <div
          className="pointer-events-none absolute top-3 left-3 z-[5] rounded-xl px-3 py-2 md:top-4 md:left-4"
          style={{
            background: 'rgba(18,12,40,.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 'var(--radius-sm)',
          }}
          role="status"
          aria-live="polite"
        >
          <p
            style={{
              font: '600 10px/1 var(--font-sans)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.4)',
            }}
          >
            Zoom
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,.9)' }}>
            {zoomLabel}
          </p>
          <p className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,.45)' }}>
            {zoomRangeLo}–{zoomRangeHi}×
          </p>
        </div>

        {/* Side panel */}
        <aside
          className={`absolute top-1/2 right-4 z-10 w-[min(100%-1.5rem,300px)] max-h-[calc(100%-1.5rem)] -translate-y-1/2 overflow-y-auto rounded-2xl p-5 transition-[transform,opacity] duration-300 ease-out md:right-6 md:w-[min(100%-3rem,320px)] ${
            sidePanelOpen
              ? 'translate-x-0 opacity-100'
              : 'pointer-events-none translate-x-[calc(100%+2rem)] opacity-0'
          }`}
          style={{
            background: 'rgba(18,12,40,0.72)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(255,255,255,.12)',
            boxShadow: '0 30px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1)',
          }}
          aria-hidden={!sidePanelOpen}
        >
          <div
            className="mb-4 flex justify-end border-b pb-3"
            style={{ borderColor: 'rgba(255,255,255,.1)' }}
          >
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-xs opacity-80 transition hover:opacity-100"
              style={{ color: 'rgba(255,255,255,.5)' }}
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
                      style={isActive ? {
                        background: 'rgba(110,75,255,.25)',
                        border: '1px solid var(--accent)',
                        color: '#fff',
                        borderRadius: 'var(--radius-sm)',
                      } : {
                        background: 'rgba(255,255,255,.07)',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: 'rgba(255,255,255,.65)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      className="px-3 py-1.5 text-xs transition"
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.12)'
                          el.style.borderColor = 'rgba(255,255,255,.25)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.07)'
                          el.style.borderColor = 'rgba(255,255,255,.12)'
                        }
                      }}
                    >
                      {i + 1}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => addDevice('phone')}
                  title="Add iPhone"
                  style={{
                    background: 'rgba(255,255,255,.07)',
                    border: '1px solid rgba(255,255,255,.12)',
                    color: 'rgba(255,255,255,.65)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  className="px-3 py-1.5 text-xs transition"
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'rgba(255,255,255,.12)'
                    el.style.borderColor = 'rgba(255,255,255,.25)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'rgba(255,255,255,.07)'
                    el.style.borderColor = 'rgba(255,255,255,.12)'
                  }}
                >
                  + Phone
                </button>
                <button
                  type="button"
                  onClick={() => addDevice('mac')}
                  title="Add MacBook"
                  style={{
                    background: 'rgba(255,255,255,.07)',
                    border: '1px solid rgba(255,255,255,.12)',
                    color: 'rgba(255,255,255,.65)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                  className="px-3 py-1.5 text-xs transition"
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'rgba(255,255,255,.12)'
                    el.style.borderColor = 'rgba(255,255,255,.25)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    el.style.background = 'rgba(255,255,255,.07)'
                    el.style.borderColor = 'rgba(255,255,255,.12)'
                  }}
                >
                  + Mac
                </button>
              </div>
              {/* Rotate / Move toggle */}
              <div className="mt-2 flex items-center gap-1.5">
                {(['rotate', 'move'] as const).map((mode) => {
                  const isActive = deviceDragMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDeviceDragMode(mode)}
                      style={isActive ? {
                        background: 'rgba(110,75,255,.25)',
                        border: '1px solid var(--accent)',
                        color: '#fff',
                        borderRadius: 'var(--radius-sm)',
                      } : {
                        background: 'rgba(255,255,255,.07)',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: 'rgba(255,255,255,.65)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs transition"
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.12)'
                          el.style.borderColor = 'rgba(255,255,255,.25)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.07)'
                          el.style.borderColor = 'rgba(255,255,255,.12)'
                        }
                      }}
                    >
                      {mode === 'rotate' ? <RotateGlyph className="h-3 w-3 shrink-0" /> : <MoveGlyph className="h-3 w-3 shrink-0" />}
                      {mode === 'rotate' ? 'Rotate' : 'Move'}
                    </button>
                  )
                })}
              </div>

              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDevice(activeDevice.id)}
                  className="mt-1.5 text-[11px] opacity-60 hover:opacity-100 transition border-0 bg-transparent p-0 cursor-pointer"
                  style={{ color: 'rgba(255,255,255,.5)' }}
                >
                  Remove device {devices.findIndex((d) => d.id === activeDeviceId) + 1}
                </button>
              )}
            </Field>

            {/* Screenshot upload for active device */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center justify-center py-7 transition"
              style={{
                border: '2px dashed rgba(110,75,255,.4)',
                borderRadius: 'var(--radius)',
                color: 'rgba(255,255,255,.65)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget
                el.style.borderColor = 'rgba(110,75,255,.7)'
                el.style.background = 'rgba(110,75,255,.06)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget
                el.style.borderColor = 'rgba(110,75,255,.4)'
                el.style.background = 'transparent'
              }}
            >
              <span style={{ font: '500 14px/1 var(--font-sans)', color: 'rgba(255,255,255,.65)' }}>
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
                className="-mt-2 self-center text-base opacity-70 hover:opacity-100 border-0 bg-transparent p-0 cursor-pointer"
                style={{ font: '400 14px/1 var(--font-sans)', color: 'rgba(255,255,255,.5)' }}
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
                      style={on ? {
                        background: 'rgba(110,75,255,.25)',
                        border: '1px solid var(--accent)',
                        color: '#fff',
                        borderRadius: 'var(--radius-sm)',
                      } : {
                        background: 'rgba(255,255,255,.07)',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: 'rgba(255,255,255,.65)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      className="px-3 py-2 text-xs transition"
                      onMouseEnter={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.12)'
                          el.style.borderColor = 'rgba(255,255,255,.25)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.07)'
                          el.style.borderColor = 'rgba(255,255,255,.12)'
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Device color">
              <div className="flex flex-col gap-3">
                {DEVICE_COLOR_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p
                      className="mb-1.5"
                      style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.35)', letterSpacing: '0.04em' }}
                    >
                      {group.label}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {group.colors.map(({ hex, name }) => {
                        const selected = deviceColor.toLowerCase() === hex.toLowerCase()
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => updateDevice(activeDevice.id, { deviceColor: hex })}
                            title={name}
                            aria-label={name}
                            className={`h-7 w-7 rounded-full border-2 transition ${selected ? 'scale-110' : ''}`}
                            style={{
                              background: hex,
                              borderColor: selected ? 'var(--accent)' : 'rgba(255,255,255,.22)',
                              boxShadow: selected ? '0 0 14px rgba(110,75,255,.5)' : undefined,
                              outline: (hex === '#F5F5F5' || hex === '#FCFCFC' || hex === '#FFFCF5' || hex === '#F0F9FF') ? '1px solid rgba(255,255,255,.15)' : undefined,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Field>

            {devices.length > 1 && (
              <Field label="Position X">
                <label className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
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
                    className="min-w-0 flex-1 accent-[var(--accent)]"
                  />
                </label>
              </Field>
            )}

            <Field label="Background">
              <ColorRow value={bgColor} onChange={setBgColor} swatches={[...BG_SWATCHES]} />
              <div className="mt-2 flex flex-wrap gap-2">
                {GRADIENT_PRESETS.map((g) => {
                  const selected = bgColor === g.css
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setBgColor(g.css)}
                      title={g.label}
                      className="h-8 w-8 rounded-full border-2 transition"
                      style={{
                        background: g.css,
                        borderColor: selected ? 'var(--accent)' : 'rgba(255,255,255,.22)',
                        boxShadow: selected ? '0 0 14px rgba(110,75,255,.5)' : undefined,
                        transform: selected ? 'scale(1.05)' : undefined,
                      }}
                      aria-label={g.label}
                      aria-pressed={selected}
                    />
                  )
                })}
              </div>
            </Field>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'rgba(255,255,255,.8)' }}>
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
              <p style={{ font: '400 11px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}>
                Slowly spins all devices (Y / turntable).
              </p>
            </div>

            <Field label="Camera roll">
              <p
                className="mb-2 leading-snug"
                style={{ font: '400 13px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
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
                ).map(({ rad, label }) => {
                  const on = Math.abs(cameraRoll - rad) < 0.02
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCameraRoll(rad)}
                      style={on ? {
                        background: 'rgba(110,75,255,.25)',
                        border: '1px solid var(--accent)',
                        color: '#fff',
                        borderRadius: 'var(--radius-sm)',
                      } : {
                        background: 'rgba(255,255,255,.07)',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: 'rgba(255,255,255,.65)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      className="px-2.5 py-1 text-xs transition"
                      onMouseEnter={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.12)'
                          el.style.borderColor = 'rgba(255,255,255,.25)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.07)'
                          el.style.borderColor = 'rgba(255,255,255,.12)'
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
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
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
              </label>
            </Field>

            <Field label="Device rotation">
              <p
                className="mb-2 leading-snug"
                style={{ font: '400 13px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
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
                    style={{ color: 'rgba(255,255,255,.5)' }}
                  >
                    <span>
                      <span style={{ color: 'rgba(255,255,255,.9)', fontWeight: 500 }}>
                        {title}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,.45)' }}> — {hint}</span>
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
                        className="min-w-0 flex-1 accent-[var(--accent)]"
                      />
                    </span>
                  </label>
                )
              })}
              <button
                type="button"
                onClick={() => resetDeviceRotation(activeDevice.id)}
                style={{
                  background: 'rgba(255,255,255,.07)',
                  border: '1px solid rgba(255,255,255,.12)',
                  color: 'rgba(255,255,255,.65)',
                  borderRadius: 'var(--radius-sm)',
                }}
                className="mt-2 px-2.5 py-1 text-xs transition"
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(255,255,255,.12)'
                  el.style.borderColor = 'rgba(255,255,255,.25)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(255,255,255,.07)'
                  el.style.borderColor = 'rgba(255,255,255,.12)'
                }}
              >
                Reset XYZ
              </button>
            </Field>

            <div className="pt-1">
              <p
                className="mb-2"
                style={{
                  font: '600 10px/1 var(--font-sans)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,.4)',
                }}
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
                      style={on ? {
                        background: 'rgba(110,75,255,.25)',
                        border: '1px solid var(--accent)',
                        color: '#fff',
                        borderRadius: 'var(--radius-sm)',
                      } : {
                        background: 'rgba(255,255,255,.07)',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: 'rgba(255,255,255,.65)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      className="px-2 py-2 text-xs transition"
                      onMouseEnter={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.12)'
                          el.style.borderColor = 'rgba(255,255,255,.25)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!on) {
                          const el = e.currentTarget
                          el.style.background = 'rgba(255,255,255,.07)'
                          el.style.borderColor = 'rgba(255,255,255,.12)'
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p
                className="mb-3 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
                {EXPORT_PRESETS.find((p) => p.id === exportPreset)?.hint}. Same framing as the viewport; lossless PNG.
              </p>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span style={{ font: '400 12px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.65)' }}>
                  No background
                  <span className="mt-0.5 block" style={{ font: '400 10px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}>
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
                className="w-full cursor-pointer py-3.5 transition enabled:hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 6px 20px -6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,.25)',
                  font: '600 15px/1 var(--font-sans)',
                  border: 'none',
                }}
              >
                {exporting ? 'Exporting…' : 'Export PNG'}
              </button>
              {exportError && (
                <p className="mt-2 text-center text-xs leading-relaxed text-amber-600 dark:text-amber-400/90">
                  {exportError}
                </p>
              )}
              <p
                className="mt-2 text-center"
                style={{ font: '400 12px/1 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                No watermark — reframe before export
              </p>
            </div>
          </div>
        </aside>
      </div>
      <ProjectPicker
        open={pickerOpen}
        currentProjectId={activeProject?.id ?? null}
        onPick={switchToProject}
        onCreate={createAndOpen}
        onClose={async () => {
          setPickerOpen(false)
          if (activeProject) {
            const refreshed = await projectStore.get(activeProject.id)
            if (refreshed) setActiveProject(refreshed)
          }
        }}
      />
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
        className="mb-2"
        style={{
          font: '600 11px/1 var(--font-sans)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,.4)',
        }}
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
                ? 'scale-105'
                : ''
            }`}
            style={{
              background: s,
              borderColor: selected ? 'var(--accent)' : 'rgba(255,255,255,.22)',
              boxShadow: selected ? '0 0 14px rgba(110,75,255,.5)' : undefined,
            }}
            aria-label={`Color ${s}`}
          />
        )
      })}
    </div>
  )
}
