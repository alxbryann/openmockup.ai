import { useCallback, useEffect, useRef, useState } from 'react'
import { exportPixelSize } from './highResCapture'
import { CHROMA_KEY_GREEN } from './highResVideoExport'
import {
  Scene,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  ORBIT_ZOOM_REF_DISTANCE,
} from './Scene'
import { useStore, type DeviceKind } from './store'
import { inferScreenMediaKind, revokeScreenSrc } from './screenMedia'
import { VideoTimelineIsland } from './VideoTimelineIsland'
import { useVideoScreenBridge } from './videoScreenBridge'
import { GRADIENT_PRESETS } from './gradients'
import { projectStore, snapshotFromStoreState, type Project } from './projectStore'
import { ProjectPicker } from './ProjectPicker'

type AppProps = { initialProjectId?: string | null }

/**
 * What gets baked under the device in the exported PNG:
 *  - `solid`        → current scene background (color or gradient)
 *  - `green`        → flat chroma-key green for easy keying in editors
 *  - `transparent`  → no fill, exports an alpha-channel PNG
 */
type PngBgMode = 'solid' | 'green' | 'transparent'

type StudioSectionId = 'devices' | 'content' | 'design' | 'layout' | 'scene' | 'camera'

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
    cameraPanFree,
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
  const autosaveDebounceRef = useRef<number | null>(null)
  const autosaveMaxWaitRef = useRef<number | null>(null)

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

  // Autosave: debounce 600 ms after each change, but also force-save every 2.5 s
  // so continuous changes (e.g. auto-rotate ticking each frame) still persist
  // and keep the gallery thumbnail fresh.
  useEffect(() => {
    if (!activeProject || !projectReadyRef.current) return

    const projectId = activeProject.id

    async function commitSave() {
      if (autosaveDebounceRef.current != null) {
        window.clearTimeout(autosaveDebounceRef.current)
        autosaveDebounceRef.current = null
      }
      if (autosaveMaxWaitRef.current != null) {
        window.clearTimeout(autosaveMaxWaitRef.current)
        autosaveMaxWaitRef.current = null
      }
      const s = useStore.getState()
      const snapshot = snapshotFromStoreState({
        devices: s.devices,
        bgColor: s.bgColor,
        uiTheme: s.uiTheme,
        cameraRoll: s.cameraRoll,
        orbitDistance: s.orbitDistance,
        autoRotate: s.autoRotate,
        cameraPosition: s.cameraPosition,
        cameraTarget: s.cameraTarget,
        viewportAspect: s.viewportAspect,
        viewportInsetRight: s.viewportInsetRight,
      })
      const thumbnail = await captureProjectThumbnail(s.bgColor, s.viewportInsetRight)
      projectStore
        .save(projectId, thumbnail !== null ? { snapshot, thumbnail } : { snapshot })
        .then((p) => setActiveProject(p))
        .catch((e) => console.error('autosave failed', e))
    }

    if (autosaveDebounceRef.current != null) window.clearTimeout(autosaveDebounceRef.current)
    autosaveDebounceRef.current = window.setTimeout(commitSave, 600)
    if (autosaveMaxWaitRef.current == null) {
      autosaveMaxWaitRef.current = window.setTimeout(commitSave, 2500)
    }
  }, [activeProject, devices, bgColor, uiTheme, cameraRoll, orbitDistance, autoRotate, cameraPosition, cameraTarget, viewportAspect, viewportInsetRight])

  // Cancel any pending autosave for the previous project when the active
  // project changes (or when the studio unmounts). Without this, the 2.5 s
  // max-wait timer could fire after a project switch and write the new
  // scene's thumbnail to the OLD project id captured in its closure.
  useEffect(() => {
    return () => {
      if (autosaveDebounceRef.current != null) {
        window.clearTimeout(autosaveDebounceRef.current)
        autosaveDebounceRef.current = null
      }
      if (autosaveMaxWaitRef.current != null) {
        window.clearTimeout(autosaveMaxWaitRef.current)
        autosaveMaxWaitRef.current = null
      }
    }
  }, [activeProject?.id])

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
  const { screenshot, screenMediaKind, screenLoadError, deviceKind, deviceColor, deviceRotation } =
    activeDevice

  const [exporting, setExporting] = useState(false)
  const [exportPreset, setExportPreset] = useState<ExportPreset>(3840)
  const [pngBgMode, setPngBgMode] = useState<PngBgMode>('solid')
  const [exportError, setExportError] = useState<string | null>(null)
  const [studioReady, setStudioReady] = useState(false)
  const [openSections, setOpenSections] = useState<Record<StudioSectionId, boolean>>({
    devices: true,
    content: true,
    design: true,
    layout: false,
    scene: true,
    camera: false,
  })
  const toggleSection = useCallback((id: StudioSectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])
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

  function clearActiveScreen() {
    revokeScreenSrc(activeDevice.screenshot, activeDevice.screenMediaKind)
    useVideoScreenBridge.getState().unregisterVideo(activeDevice.id)
    updateDevice(activeDevice.id, {
      screenshot: null,
      screenMediaKind: null,
      screenLoadError: null,
      videoStartTime: 0,
      videoEndTime: null,
    })
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    updateDevice(activeDevice.id, { screenLoadError: null })

    const mediaKind = inferScreenMediaKind(file)

    if (mediaKind === 'video') {
      revokeScreenSrc(activeDevice.screenshot, activeDevice.screenMediaKind)
      const objectUrl = URL.createObjectURL(file)
      updateDevice(activeDevice.id, {
        screenshot: objectUrl,
        screenMediaKind: 'video',
        videoStartTime: 0,
        videoEndTime: null,
      })
      return
    }

    const isHeic =
      /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)

    try {
      revokeScreenSrc(activeDevice.screenshot, activeDevice.screenMediaKind)
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
      updateDevice(activeDevice.id, { screenshot: dataUrl, screenMediaKind: 'image' })
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
          setExportError('No se encontró el canvas 3D.')
          return
        }
        const capture = useStore.getState().captureSceneAtSize
        let dataUrl: string
        // Anything other than a solid current-bg @ screen size needs the offscreen path.
        const needOffscreen = pngBgMode !== 'solid' || exportPreset !== 'screen'
        if (needOffscreen) {
          if (!capture) {
            setExportError('La escena aún no está lista. Espera un momento y vuelve a intentarlo.')
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
              setExportError(`Tu GPU soporta hasta ${maxTex}px por lado. Elige otra resolución.`)
              return
            }
          }
          const captureOpts =
            pngBgMode === 'transparent'
              ? { transparent: true }
              : pngBgMode === 'green'
                ? { bgCss: CHROMA_KEY_GREEN }
                : { bgCss: bgColor }
          dataUrl = capture(w, h, captureOpts)
        } else {
          dataUrl = canvas.toDataURL('image/png')
        }
        const link = document.createElement('a')
        link.download = `openmockup-${Date.now()}.png`
        link.href = dataUrl
        link.click()
      } catch (err) {
        console.error(err)
        setExportError('Error al exportar. Prueba con "Pantalla" o una resolución más baja.')
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
        <button
          type="button"
          onClick={() => {
            history.pushState(null, '', '/')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}
          aria-label="Go to landing page"
          title="Go to landing"
          className="flex cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent p-1 transition"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
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
        </button>
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

        {screenMediaKind === 'video' && <VideoTimelineIsland deviceId={activeDevice.id} />}

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

          <div className="flex flex-col gap-1.5">

            {/* 1 · DEVICES — choose / add / remove */}
            <Section
              id="devices"
              title="Dispositivos"
              icon={<DeviceStackGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint={`${devices.length} en escena`}
              open={openSections.devices}
              onToggle={() => toggleSection('devices')}
            >
              <SubLabel>Activo</SubLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {devices.map((d, i) => (
                  <Pill
                    key={d.id}
                    active={d.id === activeDeviceId}
                    onClick={() => setActiveDeviceId(d.id)}
                  >
                    {i + 1}
                  </Pill>
                ))}
                <Pill onClick={() => addDevice('phone')} title="Añadir iPhone">+ Phone</Pill>
                <Pill onClick={() => addDevice('mac')} title="Añadir MacBook">+ Mac</Pill>
              </div>

              <SubLabel className="mt-3">Arrastre del dispositivo</SubLabel>
              <div className="flex items-center gap-1.5">
                {(['rotate', 'move'] as const).map((mode) => {
                  const isActive = deviceDragMode === mode
                  const disabled = cameraPanFree
                  return (
                    <Pill
                      key={mode}
                      active={isActive}
                      disabled={disabled}
                      onClick={() => setDeviceDragMode(mode)}
                      className="flex items-center gap-1"
                    >
                      {mode === 'rotate'
                        ? <RotateGlyph className="h-3 w-3 shrink-0" />
                        : <MoveGlyph className="h-3 w-3 shrink-0" />}
                      {mode === 'rotate' ? 'Rotar' : 'Mover'}
                    </Pill>
                  )
                })}
              </div>
              {cameraPanFree && (
                <p
                  className="mt-1.5"
                  style={{ font: '400 11px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
                >
                  Cambia a modo "Dispositivo" en la sección Cámara para usar arrastre.
                </p>
              )}

              {devices.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDevice(activeDevice.id)}
                  className="mt-3 text-[11px] opacity-60 hover:opacity-100 transition border-0 bg-transparent p-0 cursor-pointer self-start"
                  style={{ color: 'rgba(255,160,180,.85)' }}
                >
                  ✕ Eliminar dispositivo {devices.findIndex((d) => d.id === activeDeviceId) + 1}
                </button>
              )}
            </Section>

            {/* 2 · CONTENT — image or video for active device */}
            <Section
              id="content"
              title="Contenido en pantalla"
              icon={<UploadGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint={
                screenshot
                  ? screenMediaKind === 'video' ? 'Video' : 'Imagen'
                  : 'Vacío'
              }
              open={openSections.content}
              onToggle={() => toggleSection('content')}
            >
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 py-5 transition"
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
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'rgba(255,255,255,.7)' }}>
                  {screenshot
                    ? screenMediaKind === 'video'
                      ? '+ Reemplazar video'
                      : '+ Reemplazar imagen'
                    : '+ Subir imagen o video'}
                </span>
                <span style={{ font: '400 10px/1.3 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}>
                  PNG · JPG · HEIC · MP4 · MOV · WebM
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={onUpload}
              />

              {screenshot && (
                <button
                  type="button"
                  onClick={clearActiveScreen}
                  className="mt-2 self-center text-xs opacity-70 hover:opacity-100 border-0 bg-transparent p-0 cursor-pointer"
                  style={{ font: '400 12px/1 var(--font-sans)', color: 'rgba(255,255,255,.55)' }}
                >
                  Quitar contenido
                </button>
              )}
              {screenLoadError && (
                <p className="mt-2 text-xs leading-relaxed text-amber-600 dark:text-amber-400/90">
                  {screenLoadError}
                </p>
              )}
            </Section>

            {/* 3 · DESIGN — device type + color */}
            <Section
              id="design"
              title="Diseño del dispositivo"
              icon={<PaletteGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint={deviceKind === 'phone' ? 'iPhone' : 'MacBook'}
              open={openSections.design}
              onToggle={() => toggleSection('design')}
            >
              <SubLabel>Tipo</SubLabel>
              <div className="flex flex-wrap gap-1.5">
                {DEVICE_OPTIONS.map(({ id, label }) => (
                  <Pill
                    key={id}
                    active={deviceKind === id}
                    onClick={() => {
                      updateDevice(activeDevice.id, { deviceKind: id })
                      resetDeviceRotation(activeDevice.id)
                    }}
                    className="px-3 py-2"
                  >
                    {label}
                  </Pill>
                ))}
              </div>

              <SubLabel className="mt-3">Color</SubLabel>
              <div className="flex flex-col gap-3">
                {DEVICE_COLOR_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p
                      className="mb-1.5"
                      style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.4)', letterSpacing: '0.04em' }}
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
            </Section>

            {/* 4 · LAYOUT — position + rotation */}
            <Section
              id="layout"
              title="Posición y rotación"
              icon={<MoveGlyph className="h-3.5 w-3.5 shrink-0" />}
              open={openSections.layout}
              onToggle={() => toggleSection('layout')}
            >
              {devices.length > 1 && (
                <>
                  <SubLabel>Posición X</SubLabel>
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
                </>
              )}

              <SubLabel className={devices.length > 1 ? 'mt-3' : ''}>
                Rotación · dispositivo {devices.findIndex((d) => d.id === activeDeviceId) + 1}
              </SubLabel>
              <p
                className="mb-2 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
                Arrastra sobre el canvas para ajustar; Shift+arrastre = Z.
              </p>
              {(
                [
                  { axis: 0 as const, title: 'X', hint: 'frente ↔ atrás' },
                  { axis: 1 as const, title: 'Y', hint: 'plato giratorio' },
                  { axis: 2 as const, title: 'Z', hint: 'inclinación lateral' },
                ] as const
              ).map(({ axis, title, hint }) => {
                const rad = deviceRotation[axis]
                const deg = Math.round((rad * 180) / Math.PI)
                return (
                  <label
                    key={axis}
                    className="mb-2 flex flex-col gap-0.5 text-xs last:mb-0"
                    style={{ color: 'rgba(255,255,255,.5)' }}
                  >
                    <span>
                      <span style={{ color: 'rgba(255,255,255,.85)', fontWeight: 600 }}>{title}</span>
                      <span style={{ color: 'rgba(255,255,255,.4)' }}> · {hint}</span>
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
              <Pill
                onClick={() => resetDeviceRotation(activeDevice.id)}
                className="mt-2 self-start px-2.5 py-1"
              >
                Reset XYZ
              </Pill>
            </Section>

            {/* 5 · SCENE — background + ambient motion */}
            <Section
              id="scene"
              title="Escena"
              icon={<SunGlyph className="h-3.5 w-3.5 shrink-0" />}
              open={openSections.scene}
              onToggle={() => toggleSection('scene')}
            >
              <SubLabel>Fondo</SubLabel>
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

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="flex flex-col">
                  <span style={{ font: '500 13px/1 var(--font-sans)', color: 'rgba(255,255,255,.85)' }}>
                    Auto-rotar
                  </span>
                  <span className="mt-0.5" style={{ font: '400 11px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}>
                    Gira lento todos los dispositivos (eje Y)
                  </span>
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
            </Section>

            {/* 6 · CAMERA — interaction mode + roll */}
            <Section
              id="camera"
              title="Cámara"
              icon={<CameraNavGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint={cameraPanFree ? 'Cámara libre' : 'Dispositivo'}
              open={openSections.camera}
              onToggle={() => toggleSection('camera')}
            >
              <SubLabel>Modo (canvas)</SubLabel>
              <p
                className="mb-2 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
                {cameraPanFree
                  ? 'Arrastra para mirar alrededor. WASD + Espacio/Shift para volar. Atajo: H'
                  : 'Arrastra para rotar/mover el dispositivo activo. Atajo: V'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'device' as const, label: 'Dispositivo', panFree: false, icon: <PhoneGlyph className="h-3.5 w-3.5 shrink-0" /> },
                    { id: 'camera' as const, label: 'Cámara libre', panFree: true, icon: <CameraNavGlyph className="h-3.5 w-3.5 shrink-0" /> },
                  ] as const
                ).map(({ id, label, panFree, icon }) => (
                  <Pill
                    key={id}
                    active={cameraPanFree === panFree}
                    onClick={() => setCameraPanFree(panFree)}
                    className="flex items-center gap-1 px-2.5 py-1.5"
                  >
                    {icon}
                    {label}
                  </Pill>
                ))}
              </div>

              <SubLabel className="mt-3">Inclinación (roll)</SubLabel>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(
                  [
                    { rad: 0, label: '0°' },
                    { rad: Math.PI / 2, label: '90°' },
                    { rad: Math.PI, label: '180°' },
                    { rad: -Math.PI / 2, label: '270°' },
                  ] as const
                ).map(({ rad, label }) => (
                  <Pill
                    key={label}
                    active={Math.abs(cameraRoll - rad) < 0.02}
                    onClick={() => setCameraRoll(rad)}
                    className="px-2.5 py-1"
                  >
                    {label}
                  </Pill>
                ))}
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
            </Section>

            {/* 7 · EXPORT — primary CTA, always visible */}
            <div
              className="mt-2 rounded-2xl p-4"
              style={{
                background: 'linear-gradient(180deg, rgba(110,75,255,.10), rgba(110,75,255,.04))',
                border: '1px solid rgba(110,75,255,.25)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <DownloadGlyph className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <h2
                  style={{
                    font: '700 12px/1 var(--font-sans)',
                    letterSpacing: '0.02em',
                    color: 'rgba(255,255,255,.95)',
                    margin: 0,
                  }}
                >
                  Exportar imagen (PNG)
                </h2>
              </div>

              {screenMediaKind === 'video' && (
                <p
                  className="mb-3 rounded-md px-2.5 py-1.5"
                  style={{
                    font: '400 11px/1.4 var(--font-sans)',
                    color: 'rgba(180,160,255,.95)',
                    background: 'rgba(110,75,255,.12)',
                    border: '1px solid rgba(110,75,255,.22)',
                  }}
                >
                  Para exportar el clip de video usa el panel inferior ↓
                </p>
              )}

              <SubLabel>Resolución</SubLabel>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {EXPORT_PRESETS.map(({ id, label }) => (
                  <Pill
                    key={String(id)}
                    active={exportPreset === id}
                    onClick={() => {
                      setExportPreset(id)
                      setExportError(null)
                    }}
                    className="justify-center py-2"
                  >
                    {label}
                  </Pill>
                ))}
              </div>
              <p
                className="mb-3 leading-snug"
                style={{ font: '400 10px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                {EXPORT_PRESETS.find((p) => p.id === exportPreset)?.hint}
              </p>

              <SubLabel>Fondo</SubLabel>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'solid' as const, label: 'Actual' },
                    { id: 'green' as const, label: 'Verde' },
                    { id: 'transparent' as const, label: 'Sin fondo' },
                  ] as const
                ).map(({ id, label }) => (
                  <Pill
                    key={id}
                    active={pngBgMode === id}
                    onClick={() => { setPngBgMode(id); setExportError(null) }}
                    className="justify-center px-2 py-1.5"
                  >
                    {label}
                  </Pill>
                ))}
              </div>
              <p
                className="mb-3 leading-snug"
                style={{ font: '400 10px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
                {pngBgMode === 'solid'
                  ? 'Usa el fondo actual de la escena.'
                  : pngBgMode === 'green'
                    ? 'Pantalla verde (#00FF00) — fácil de quitar con chroma key.'
                    : 'PNG con canal alfa — sin fondo.'}
              </p>

              <button
                type="button"
                onClick={exportPNG}
                disabled={exporting}
                className="w-full cursor-pointer py-3 transition enabled:hover:brightness-110 disabled:opacity-50"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 6px 20px -6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,.25)',
                  font: '600 14px/1 var(--font-sans)',
                  border: 'none',
                }}
              >
                {exporting ? 'Exportando…' : 'Exportar PNG'}
              </button>
              {exportError && (
                <p className="mt-2 text-center text-xs leading-relaxed" style={{ color: 'rgba(255,170,90,.95)' }}>
                  {exportError}
                </p>
              )}
              <p
                className="mt-2 text-center"
                style={{ font: '400 10px/1 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                Sin marca de agua · reencuadra antes de exportar
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

function CameraNavGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5" strokeLinecap="round" />
      <path d="M20 8.5V6a2 2 0 0 0-2-2h-2.5" strokeLinecap="round" />
      <path d="M4 15.5V18a2 2 0 0 0 2 2h2.5" strokeLinecap="round" />
      <path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
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

function DeviceStackGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3.5" width="9" height="14" rx="1.6" />
      <rect x="11" y="6.5" width="9" height="14" rx="1.6" />
    </svg>
  )
}

function UploadGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function PaletteGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-2 2v.5A2.5 2.5 0 0 1 11.5 21z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="11" cy="7" r="1" fill="currentColor" />
      <circle cx="16" cy="9" r="1" fill="currentColor" />
    </svg>
  )
}

function SunGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <path d="M4.2 4.2l1.4 1.4" />
      <path d="M18.4 18.4l1.4 1.4" />
      <path d="M3 12h2" />
      <path d="M19 12h2" />
      <path d="M4.2 19.8l1.4-1.4" />
      <path d="M18.4 5.6l1.4-1.4" />
    </svg>
  )
}

function DownloadGlyph({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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

const THUMBNAIL_TARGET_HEIGHT = 360
const THUMBNAIL_JPEG_QUALITY = 0.82

/**
 * Renders the scene off-screen, crops the area covered by the side panel,
 * and returns a small JPEG data URL. The crop matches the visible region
 * the author sees in the studio so gallery previews reproduce that framing
 * exactly (no canvas-aspect drift, no spinning device).
 */
async function captureProjectThumbnail(
  bgColor: string,
  viewportInsetRight: number,
): Promise<string | null> {
  const capture = useStore.getState().captureSceneAtSize
  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
  if (!capture || !canvas) return null
  const fullW = canvas.clientWidth
  const fullH = canvas.clientHeight
  if (fullW <= 0 || fullH <= 0) return null

  const visibleFrac = Math.max(0.1, Math.min(1, 1 - (viewportInsetRight || 0)))
  const targetH = THUMBNAIL_TARGET_HEIGHT
  const targetFullW = Math.max(1, Math.round((targetH * fullW) / fullH))
  const targetVisibleW = Math.max(1, Math.round(targetFullW * visibleFrac))

  let pngFull: string
  try {
    pngFull = capture(targetFullW, targetH, { bgCss: bgColor })
  } catch (err) {
    console.warn('Thumbnail capture failed', err)
    return null
  }

  return new Promise<string | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = targetVisibleW
      c.height = targetH
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      try {
        resolve(c.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = pngFull
  })
}

/**
 * Collapsible accordion card that groups one chunk of the studio sidebar.
 * Header is always visible and clickable; body collapses to height 0 when closed.
 *
 * Visual: subtle glass card with hover, chevron that rotates 90deg when open.
 */
function Section({
  id,
  title,
  icon,
  hint,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  icon?: React.ReactNode
  hint?: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const bodyId = `section-${id}-body`
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 'var(--radius-sm)',
        background: open ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.02)',
        border: '1px solid rgba(255,255,255,.07)',
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2.5 text-left transition"
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.04)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        {icon && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center"
            style={{ color: open ? 'var(--accent)' : 'rgba(255,255,255,.55)' }}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <span
          className="flex-1"
          style={{
            font: '600 12px/1 var(--font-sans)',
            letterSpacing: '0.01em',
            color: open ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.75)',
          }}
        >
          {title}
        </span>
        {hint && (
          <span
            className="tabular-nums"
            style={{ font: '500 11px/1 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
          >
            {hint}
          </span>
        )}
        <span
          className="shrink-0 transition-transform"
          style={{
            color: 'rgba(255,255,255,.4)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
          aria-hidden
        >
          <ChevronRightGlyph className="h-4 w-4 shrink-0" />
        </span>
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col px-3 pt-1 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}

/** Small uppercase caption used to label a sub-control inside a Section. */
function SubLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`mb-1.5 ${className}`}
      style={{
        font: '600 10px/1 var(--font-sans)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,.4)',
      }}
    >
      {children}
    </p>
  )
}

/**
 * Universal pill button for tab-style choices.
 * Active = accent border + tint; idle = subtle glass; disabled = greyed out.
 */
function Pill({
  active = false,
  disabled = false,
  onClick,
  title,
  className = '',
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  className?: string
  children: React.ReactNode
}) {
  const base = {
    borderRadius: 'var(--radius-sm)',
  } as React.CSSProperties
  const variant: React.CSSProperties = disabled
    ? {
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
        color: 'rgba(255,255,255,.28)',
        cursor: 'not-allowed',
      }
    : active
      ? {
          background: 'rgba(110,75,255,.25)',
          border: '1px solid var(--accent)',
          color: '#fff',
        }
      : {
          background: 'rgba(255,255,255,.07)',
          border: '1px solid rgba(255,255,255,.12)',
          color: 'rgba(255,255,255,.65)',
        }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...base, ...variant }}
      className={`px-3 py-1.5 text-xs transition ${className}`}
      onMouseEnter={(e) => {
        if (disabled || active) return
        const el = e.currentTarget
        el.style.background = 'rgba(255,255,255,.12)'
        el.style.borderColor = 'rgba(255,255,255,.25)'
      }}
      onMouseLeave={(e) => {
        if (disabled || active) return
        const el = e.currentTarget
        el.style.background = 'rgba(255,255,255,.07)'
        el.style.borderColor = 'rgba(255,255,255,.12)'
      }}
    >
      {children}
    </button>
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
