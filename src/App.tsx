import { useCallback, useEffect, useRef, useState } from 'react'
import { exportPixelSize } from './highResCapture'
import { CHROMA_KEY_GREEN } from './highResVideoExport'
import { ASPECT_PRESETS, aspectRatioOf, resolveExportDimensions } from './aspectPresets'
import { PLATFORM_EXPORT_PRESETS } from './platformExportPresets'
import {
  BUILTIN_CAMERA_PRESETS,
  deleteUserCameraPreset,
  listUserCameraPresets,
  saveUserCameraPreset,
  type CameraPreset,
} from './cameraPresets'
import {
  SCENE_TEMPLATES,
  buildTemplateSnapshot,
  getSceneTemplate,
  type SceneTemplate,
} from './sceneTemplates'
import {
  captureSceneAsTemplate,
  deleteUserTemplate,
  listUserTemplates,
  saveUserTemplate,
} from './userTemplates'
import { warmBuiltinTemplateThumbnails } from './templateThumbnails'
import { TemplateCard } from './TemplateCard'
import { useAuth, SUPABASE_ENABLED } from './useAuth'
import { supabase } from './supabase'
import {
  Scene,
  ORBIT_MAX_DISTANCE,
  ORBIT_MIN_DISTANCE,
  ORBIT_ZOOM_REF_DISTANCE,
} from './Scene'
import { useStore, type DeviceKind } from './store'
import { inferScreenMediaKind, revokeScreenSrc } from './screenMedia'
import {
  deleteDeviceMedia,
  isStorageConfigured,
  uploadDeviceVideo,
} from './mediaStorage'
import { VideoTimelineIsland } from './VideoTimelineIsland'
import { useVideoScreenBridge } from './videoScreenBridge'
import { GRADIENT_PRESETS } from './gradients'
import { projectStore, snapshotFromStoreState, type Project } from './projectStore'
import { ProjectPicker } from './ProjectPicker'
import { AgentPanel } from './AgentPanel'
import { BatchExportPanel } from './BatchExportPanel'
import { MotionPanel } from './MotionPanel'
import { MotionTimeline } from './MotionTimeline'
import { buildDeviceWall } from './deviceWall'
import { listBrandKits, saveBrandKit, brandKitToWatermark, type BrandKit } from './brandKits'
import { saveProjectRevision } from './projectHistory'
import { ProjectHistoryPanel } from './ProjectHistoryPanel'
import { preloadLogo } from './watermark'

type AppProps = { initialProjectId?: string | null }

/**
 * What gets baked under the device in the exported PNG:
 *  - `solid`        → current scene background (color or gradient)
 *  - `green`        → flat chroma-key green for easy keying in editors
 *  - `transparent`  → no fill, exports an alpha-channel PNG
 */
type PngBgMode = 'solid' | 'green' | 'transparent'

type StudioSectionId = 'templates' | 'devices' | 'content' | 'design' | 'layout' | 'scene' | 'camera' | 'motion' | 'batch'

const DEVICE_OPTIONS: { id: DeviceKind; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'mac', label: 'Mac' },
  { id: 'ipad', label: 'iPad' },
  { id: 'watch', label: 'Watch' },
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
  const beforeFileRef = useRef<HTMLInputElement>(null)
  const sceneHostRef = useRef<HTMLDivElement>(null)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
  const [studioView, setStudioView] = useState<'normal' | 'agent'>('normal')
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
    setDeviceScale,
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

  const aspectPreset = useStore((s) => s.aspectPreset)
  const setAspectPreset = useStore((s) => s.setAspectPreset)
  const aspectRatioValue = aspectRatioOf(aspectPreset)
  const environmentIntensity = useStore((s) => s.environmentIntensity)
  const ambientIntensity = useStore((s) => s.ambientIntensity)
  const keyLightIntensity = useStore((s) => s.keyLightIntensity)
  const setEnvironmentIntensity = useStore((s) => s.setEnvironmentIntensity)
  const setAmbientIntensity = useStore((s) => s.setAmbientIntensity)
  const setKeyLightIntensity = useStore((s) => s.setKeyLightIntensity)
  const resetLighting = useStore((s) => s.resetLighting)
  const shadowOpacity = useStore((s) => s.shadowOpacity)
  const shadowBlur = useStore((s) => s.shadowBlur)
  const shadowFar = useStore((s) => s.shadowFar)
  const shadowScaleMult = useStore((s) => s.shadowScaleMult)
  const setShadowOpacity = useStore((s) => s.setShadowOpacity)
  const setShadowBlur = useStore((s) => s.setShadowBlur)
  const setShadowFar = useStore((s) => s.setShadowFar)
  const setShadowScaleMult = useStore((s) => s.setShadowScaleMult)
  const resetShadow = useStore((s) => s.resetShadow)
  const logoWatermark = useStore((s) => s.logoWatermark)
  const setLogoWatermark = useStore((s) => s.setLogoWatermark)
  const applyDeviceWall = useStore((s) => s.applyDeviceWall)
  const applyCameraPreset = useStore((s) => s.applyCameraPreset)
  const applySceneSnapshot = useStore((s) => s.applySceneSnapshot)
  const cameraMotion = useStore((s) => s.cameraMotion)
  const cameraKeyframes = useStore((s) => s.cameraKeyframes)

  const [userTemplates, setUserTemplates] = useState<SceneTemplate[]>(() => listUserTemplates())
  const [brandKits, setBrandKits] = useState<BrandKit[]>(() => listBrandKits())
  const [historyOpen, setHistoryOpen] = useState(false)
  const allTemplates = [...SCENE_TEMPLATES, ...userTemplates]

  const [userCameraPresets, setUserCameraPresets] = useState<CameraPreset[]>(() => listUserCameraPresets())

  const handleSaveCameraPreset = useCallback(() => {
    const s = useStore.getState()
    const name = window.prompt('Nombre de la vista de cámara')
    if (name === null) return
    setUserCameraPresets(
      saveUserCameraPreset(name, {
        cameraPosition: s.cameraPosition,
        cameraTarget: s.cameraTarget,
        orbitDistance: s.orbitDistance,
        cameraRoll: s.cameraRoll,
      }),
    )
  }, [])

  const handleDeleteCameraPreset = useCallback((id: string) => {
    setUserCameraPresets(deleteUserCameraPreset(id))
  }, [])

  const applyTemplate = useCallback(
    (template: SceneTemplate) => {
      const patch = buildTemplateSnapshot(template, useStore.getState().devices)
      applySceneSnapshot(patch)
    },
    [applySceneSnapshot],
  )

  const handleSaveAsTemplate = useCallback(async () => {
    const name = window.prompt('Nombre del template')
    if (!name?.trim()) return
    const thumbnail = await captureProjectThumbnail(useStore.getState().bgColor, useStore.getState().viewportInsetRight)
    const template = captureSceneAsTemplate(name, thumbnail ?? useStore.getState().bgColor)
    setUserTemplates(saveUserTemplate(template))
  }, [])

  const handleDeleteUserTemplate = useCallback((id: string) => {
    if (!window.confirm('¿Eliminar este template personalizado?')) return
    setUserTemplates(deleteUserTemplate(id))
  }, [])

  const handleApplyBrandKit = useCallback(
    (kit: BrandKit) => {
      setBgColor(kit.bgColor)
      devices.forEach((d) => updateDevice(d.id, { deviceColor: kit.deviceColor }))
      const wm = brandKitToWatermark(kit)
      if (wm) {
        preloadLogo(wm.url!)
        setLogoWatermark(wm)
      }
    },
    [devices, setBgColor, updateDevice, setLogoWatermark],
  )

  const handleSaveBrandKit = useCallback(() => {
    const name = window.prompt('Nombre del brand kit')
    if (!name?.trim()) return
    const s = useStore.getState()
    const active = s.devices.find((d) => d.id === s.activeDeviceId) ?? s.devices[0]
    const kit: BrandKit = {
      id: `brand-${crypto.randomUUID()}`,
      name: name.trim(),
      bgColor: s.bgColor,
      deviceColor: active.deviceColor,
      colors: [s.bgColor, active.deviceColor],
      logoUrl: s.logoWatermark.url,
      logoOpacity: s.logoWatermark.opacity,
      logoScale: s.logoWatermark.scale,
    }
    setBrandKits(saveBrandKit(kit))
  }, [])

  const handleCreateDeviceWall = useCallback((count: number) => {
    const s = useStore.getState()
    const active = s.devices.find((d) => d.id === s.activeDeviceId) ?? s.devices[0]
    const wall = buildDeviceWall({ count, kind: active.deviceKind, source: active })
    applyDeviceWall(wall)
  }, [applyDeviceWall])

  const { user } = useAuth()
  const mediaUploadInFlight = useStore((s) => s.mediaUploadInFlight)
  const setMediaUploadInFlight = useStore((s) => s.setMediaUploadInFlight)

  async function handleSignOut() {
    history.pushState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    if (SUPABASE_ENABLED) await supabase.auth.signOut()
  }

  // Track the scene canvas aspect ratio so the embed can reproduce the same framing.
  useEffect(() => {
    const el = sceneHostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      // A fixed aspect preset owns viewportAspect (see the sync effect below);
      // don't let live host resizes overwrite the locked crop ratio.
      if (useStore.getState().aspectPreset !== 'free') return
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

  // When a fixed aspect preset is active, lock viewportAspect to the crop ratio so
  // gallery cards/embeds reproduce the same framing the author exported.
  useEffect(() => {
    if (aspectRatioValue === null) {
      const el = sceneHostRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          setViewportAspect(Math.round((r.width / r.height) * 1000) / 1000)
        }
      }
      return
    }
    const locked = Math.round(aspectRatioValue * 1000) / 1000
    if (locked !== useStore.getState().viewportAspect) setViewportAspect(locked)
  }, [aspectRatioValue, setViewportAspect])

  // Track how much of the canvas width is covered by the side panel overlay.
  // The embed uses this to reproduce the same effective framing.
  useEffect(() => {
    const host = sceneHostRef.current
    if (!host) return
    // The agent view always shows its panel; the normal view only when open.
    const panelVisible = studioView === 'agent' ? true : sidePanelOpen
    const aside = host.querySelector('aside')
    if (!panelVisible || !aside) {
      if (useStore.getState().viewportInsetRight !== 0) setViewportInsetRight(0)
      return
    }
    function measure() {
      const hostRect = host!.getBoundingClientRect()
      const asideRect = (aside as HTMLElement).getBoundingClientRect()
      // On a narrow/transient layout (e.g. mobile or a mid-resize 0-width
      // frame) the panel can cover almost the whole canvas. Baking that into
      // the shareable framing produces a broken sliver thumbnail, so ignore it.
      if (hostRect.width < 480) {
        if (useStore.getState().viewportInsetRight !== 0) setViewportInsetRight(0)
        return
      }
      // Distance from the host's right edge to the aside's left edge, as a fraction of host width.
      const insetPx = Math.max(0, hostRect.right - asideRect.left)
      // Clamp: a side panel should never legitimately count as more than ~half
      // the frame for thumbnail/gallery purposes.
      const fraction = Math.min(0.5, Math.round((insetPx / hostRect.width) * 1000) / 1000)
      if (fraction !== useStore.getState().viewportInsetRight) {
        setViewportInsetRight(fraction)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    ro.observe(aside as HTMLElement)
    return () => ro.disconnect()
  }, [sidePanelOpen, studioView, setViewportInsetRight])

  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // `true` while a project is being created/switched/loaded so we can show the
  // loading splash and freeze autosave until the new scene has hydrated.
  const [projectSwitching, setProjectSwitching] = useState(false)
  const projectReadyRef = useRef(false)
  // The id of the project whose content currently lives in the store. This is
  // the single source of truth that guards autosave: an in-flight save captures
  // its own projectId and must only persist / update `activeProject` while this
  // ref still matches — otherwise a stale save from the previous project could
  // write the new scene's content into it (the "new project takes the other's
  // name and overwrites it" bug) or clobber the header back to the old project.
  const activeProjectIdRef = useRef<string | null>(null)
  // Lock so rapid clicks on "New project" / a project row can't run two
  // create/switch flows at once.
  const projectTransitionRef = useRef(false)
  const autosaveDebounceRef = useRef<number | null>(null)
  const autosaveMaxWaitRef = useRef<number | null>(null)

  // Load (or create) the active project once, on mount.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      // The current user's own projects (authoritative, user-scoped).
      let mine: Awaited<ReturnType<typeof projectStore.list>> = []
      try {
        mine = await projectStore.list()
      } catch {
        /* not authenticated yet or list failed */
      }
      const ownIds = new Set(mine.map((p) => p.id))

      let project = null
      // An explicit id from the URL/gallery may point to a public project that
      // isn't ours — allow opening it for viewing.
      if (initialProjectId) {
        project = await projectStore.get(initialProjectId)
      }
      // The implicit "last opened" id must only resume a project we actually
      // own; otherwise a stale id left by another account in this browser would
      // leak that account's public project into ours.
      if (!project) {
        const lastId = projectStore.getLastOpenedId()
        if (lastId && ownIds.has(lastId)) project = await projectStore.get(lastId)
      }
      // Otherwise resume our most recent project, or start fresh.
      if (!project && mine.length > 0) {
        project = await projectStore.get(mine[0].id)
      }
      if (!project) {
        project = await projectStore.create()
      }
      if (cancelled) return
      activeProjectIdRef.current = project.id
      hydrateFromSnapshot(project.snapshot)
      // Apply a template requested via ?template=<id> (e.g. from the landing
      // Templates page), preserving any media on the freshly-hydrated devices.
      const requestedTemplate = new URLSearchParams(location.search).get('template')
      if (requestedTemplate) {
        const tpl = getSceneTemplate(requestedTemplate)
        if (tpl) {
          const patch = buildTemplateSnapshot(tpl, useStore.getState().devices)
          useStore.getState().applySceneSnapshot(patch)
        }
      }
      setActiveProject(project)
      projectStore.setLastOpenedId(project.id)
      // Reflect project id in URL without reloading
      const q = new URLSearchParams(location.search)
      q.delete('template')
      if (q.get('project') !== project.id) {
        q.set('studio', '')
        q.set('project', project.id)
        history.replaceState(null, '', `?${q.toString().replace('studio=&', 'studio&')}`)
      } else {
        history.replaceState(null, '', `?${q.toString()}`)
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
    if (!activeProject || !projectReadyRef.current || mediaUploadInFlight) return

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
      // The store has already been re-hydrated for a different project — abandon
      // this stale save so we don't write the new scene's content into the old id.
      if (activeProjectIdRef.current !== projectId) return
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
        aspectPreset: s.aspectPreset,
        environmentIntensity: s.environmentIntensity,
        ambientIntensity: s.ambientIntensity,
        keyLightIntensity: s.keyLightIntensity,
        cameraMotion: s.cameraMotion,
        cameraKeyframes: s.cameraKeyframes,
        shadowOpacity: s.shadowOpacity,
        shadowBlur: s.shadowBlur,
        shadowFar: s.shadowFar,
        shadowScaleMult: s.shadowScaleMult,
        logoWatermark: s.logoWatermark,
      })
      const thumbnail = await captureProjectThumbnail(s.bgColor, s.viewportInsetRight)
      // Capturing the thumbnail is async; re-check before persisting in case the
      // user switched projects while it ran.
      if (activeProjectIdRef.current !== projectId) return
      try {
        const p = await projectStore.save(
          projectId,
          thumbnail !== null ? { snapshot, thumbnail } : { snapshot },
        )
        // Only refresh the active project if it is still the one we just saved;
        // otherwise we'd clobber the header/active project back to the old one.
        if (activeProjectIdRef.current === projectId) setActiveProject(p)
        saveProjectRevision(projectId, snapshot, thumbnail)
      } catch (e) {
        console.error('autosave failed', e)
      }
    }

    if (autosaveDebounceRef.current != null) window.clearTimeout(autosaveDebounceRef.current)
    autosaveDebounceRef.current = window.setTimeout(commitSave, 600)
    if (autosaveMaxWaitRef.current == null) {
      autosaveMaxWaitRef.current = window.setTimeout(commitSave, 2500)
    }
  }, [activeProject, devices, bgColor, uiTheme, cameraRoll, orbitDistance, autoRotate, cameraPosition, cameraTarget, viewportAspect, viewportInsetRight, aspectPreset, environmentIntensity, ambientIntensity, keyLightIntensity, cameraMotion, cameraKeyframes, shadowOpacity, shadowBlur, shadowFar, shadowScaleMult, logoWatermark, mediaUploadInFlight])

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
      if (projectTransitionRef.current) return
      if (id === activeProjectIdRef.current) {
        setPickerOpen(false)
        return
      }
      projectTransitionRef.current = true
      projectReadyRef.current = false
      setProjectSwitching(true)
      setPickerOpen(false)
      try {
        const p = await projectStore.get(id)
        if (!p) return
        // Claim the new id synchronously *before* hydrating so any autosave
        // still in flight for the previous project bails instead of writing the
        // new scene's content into the old id.
        activeProjectIdRef.current = p.id
        hydrateFromSnapshot(p.snapshot)
        setActiveProject(p)
        projectStore.setLastOpenedId(p.id)
        const q = new URLSearchParams(location.search)
        q.set('project', p.id)
        history.replaceState(null, '', `?${q.toString()}`)
      } catch (e) {
        console.error('switch project failed', e)
      } finally {
        requestAnimationFrame(() => {
          projectReadyRef.current = true
          projectTransitionRef.current = false
          setProjectSwitching(false)
        })
      }
    },
    [hydrateFromSnapshot],
  )

  const createAndOpen = useCallback(async () => {
    if (projectTransitionRef.current) return
    projectTransitionRef.current = true
    projectReadyRef.current = false
    setProjectSwitching(true)
    setPickerOpen(false)
    try {
      const p = await projectStore.create()
      // Claim the new id before hydrating (see switchToProject) so a lingering
      // autosave from the previous project can't overwrite the fresh one.
      activeProjectIdRef.current = p.id
      hydrateFromSnapshot(p.snapshot)
      setActiveProject(p)
      projectStore.setLastOpenedId(p.id)
      const q = new URLSearchParams(location.search)
      q.set('project', p.id)
      history.replaceState(null, '', `?${q.toString()}`)
    } catch (e) {
      console.error('create project failed', e)
    } finally {
      requestAnimationFrame(() => {
        projectReadyRef.current = true
        projectTransitionRef.current = false
        setProjectSwitching(false)
      })
    }
  }, [hydrateFromSnapshot])

  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? devices[0]
  const { screenshot, screenMediaKind, screenLoadError, deviceKind, deviceColor, deviceRotation } =
    activeDevice

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportPreset, setExportPreset] = useState<ExportPreset>(3840)
  const [platformPresetId, setPlatformPresetId] = useState<string | null>(null)
  const [pngBgMode, setPngBgMode] = useState<PngBgMode>('solid')
  const [exportError, setExportError] = useState<string | null>(null)
  const [studioReady, setStudioReady] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<StudioSectionId, boolean>>({
    templates: false,
    devices: true,
    content: true,
    design: true,
    layout: false,
    scene: true,
    camera: false,
    motion: false,
    batch: false,
  })
  const toggleSection = useCallback((id: StudioSectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])
  const mountTimeRef = useRef(Date.now())

  const handleSceneReady = useCallback(() => {
    const elapsed = Date.now() - mountTimeRef.current
    const delay = Math.max(0, 350 - elapsed)
    setTimeout(() => {
      setStudioReady(true)
      warmBuiltinTemplateThumbnails(SCENE_TEMPLATES)
    }, delay)
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
    if (activeDevice.screenMediaStoragePath && isStorageConfigured()) {
      void deleteDeviceMedia(activeDevice.screenMediaStoragePath)
    }
    updateDevice(activeDevice.id, {
      screenshot: null,
      screenMediaKind: null,
      screenMediaStoragePath: null,
      screenLoadError: null,
      videoStartTime: 0,
      videoEndTime: null,
    })
  }

  const processFile = useCallback(async (file: File) => {
    updateDevice(activeDevice.id, { screenLoadError: null })
    const mediaKind = inferScreenMediaKind(file)

    if (mediaKind === 'video') {
      revokeScreenSrc(activeDevice.screenshot, activeDevice.screenMediaKind)
      const objectUrl = URL.createObjectURL(file)
      const prevStoragePath = activeDevice.screenMediaStoragePath
      updateDevice(activeDevice.id, {
        screenshot: objectUrl,
        screenMediaKind: 'video',
        videoStartTime: 0,
        videoEndTime: null,
        videoUploadInFlight: true,
        screenMediaStoragePath: null,
      })
      setMediaUploadInFlight(true)

      if (isStorageConfigured() && user && activeProjectIdRef.current) {
        try {
          const storagePath = await uploadDeviceVideo(
            user.id,
            activeProjectIdRef.current,
            activeDevice.id,
            file,
          )
          if (prevStoragePath && prevStoragePath !== storagePath) {
            void deleteDeviceMedia(prevStoragePath)
          }
          updateDevice(activeDevice.id, {
            screenMediaStoragePath: storagePath,
            videoUploadInFlight: false,
          })
        } catch (err) {
          console.error(err)
          updateDevice(activeDevice.id, {
            screenLoadError: 'Could not upload video. Check your connection and try again.',
            videoUploadInFlight: false,
          })
        } finally {
          setMediaUploadInFlight(false)
        }
      } else {
        updateDevice(activeDevice.id, { videoUploadInFlight: false })
        setMediaUploadInFlight(false)
      }
      return
    }

    const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)

    try {
      revokeScreenSrc(activeDevice.screenshot, activeDevice.screenMediaKind)
      let dataUrl: string
      if (isHeic) {
        const heic2any = (await import('heic2any')).default
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
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
  }, [activeDevice, updateDevice, user, setMediaUploadInFlight])

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await processFile(file)
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            processFile(file)
            break
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [processFile])

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
        // A fixed aspect preset always needs offscreen so we can crop to the exact ratio.
        const needOffscreen = pngBgMode !== 'solid' || exportPreset !== 'screen' || aspectPreset !== 'free'
        if (needOffscreen) {
          if (!capture) {
            setExportError('La escena aún no está lista. Espera un momento y vuelve a intentarlo.')
            return
          }
          const { w, h } =
            aspectPreset !== 'free'
              ? resolveExportDimensions(
                  aspectPreset,
                  exportPreset === 'screen' ? 'screen' : exportPreset,
                  canvas.clientWidth,
                  canvas.clientHeight,
                )
              : exportPreset === 'screen'
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
      {/* Studio loading splash — also re-shown briefly while switching/creating a project */}
      <div
        className="mockit-loading-overlay"
        data-hidden={studioReady && !projectSwitching ? 'true' : 'false'}
      >
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
          {studioReady ? 'Loading project…' : 'Loading studio…'}
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
            openmockup<span style={{ color: 'var(--accent)' }}>.dev</span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          {/* View toggle: Studio ↔ Agent */}
          <div
            className="flex items-center"
            style={{
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 10,
              padding: 3,
              gap: 2,
              marginRight: 4,
            }}
          >
            {(['normal', 'agent'] as const).map((v) => {
              const active = studioView === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStudioView(v)}
                  style={{
                    background: active ? 'rgba(110,75,255,.35)' : 'transparent',
                    border: active ? '1px solid rgba(110,75,255,.55)' : '1px solid transparent',
                    borderRadius: 7,
                    padding: '3px 10px',
                    font: '600 11px/1 var(--font-sans)',
                    color: active ? '#fff' : 'rgba(255,255,255,.45)',
                    cursor: 'pointer',
                    letterSpacing: '0.01em',
                    transition: 'all 0.15s',
                  }}
                >
                  {v === 'normal' ? 'Studio' : 'Agent'}
                </button>
              )
            })}
          </div>
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
            {activeProject ? (
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProject.name}
              </span>
            ) : (
              <span
                className="mockit-skeleton"
                aria-label="Loading project"
                style={{ width: 96, height: 13, borderRadius: 5 }}
              />
            )}
            <span style={{ opacity: 0.4 }}>▾</span>
          </button>
          {activeProject && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="Historial de versiones"
              className="flex cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1.5 text-xs transition"
              style={{ color: 'rgba(255,255,255,.45)', font: '500 12px/1 var(--font-sans)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              Historial
            </button>
          )}
          {studioView === 'normal' && (
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
          )}
          {user && (
            <div className="flex items-center gap-1.5 ml-1 mr-0.5">
              <div
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6e4bff, #ff7eb6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                  border: '1.5px solid rgba(255,255,255,.15)',
                }}
                title={user.email ?? 'Account'}
              >
                {(user.email?.[0] ?? '?').toUpperCase()}
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex cursor-pointer items-center gap-1 border-0 bg-transparent px-2 py-1 rounded-lg transition text-xs"
                style={{ color: 'rgba(255,255,255,.45)', font: '500 12px/1 var(--font-sans)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.45)' }}
              >
                Sign out
              </button>
            </div>
          )}
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

      <div
        ref={sceneHostRef}
        className="relative min-h-0 flex-1"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDraggingOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDraggingOver(false)
          const file = e.dataTransfer.files[0]
          if (file) processFile(file)
        }}
      >
        <Scene onReady={handleSceneReady} />

        {/* Aspect-ratio crop frame — shows the exact export region when a social preset is active */}
        {aspectRatioValue !== null && (
          <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center">
            <div
              style={{
                aspectRatio: String(aspectRatioValue),
                maxWidth: '100%',
                maxHeight: '100%',
                width: aspectRatioValue >= 1 ? '100%' : 'auto',
                height: aspectRatioValue >= 1 ? 'auto' : '100%',
                boxShadow: '0 0 0 9999px rgba(8,6,18,.55)',
                border: '1px solid rgba(255,255,255,.45)',
                borderRadius: 2,
              }}
            />
          </div>
        )}

        {/* Drag-and-drop overlay */}
        {isDraggingOver && (
          <div
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3"
            style={{
              background: 'rgba(18,12,40,.75)',
              backdropFilter: 'blur(6px)',
              border: '2px dashed rgba(110,75,255,.7)',
              boxSizing: 'border-box',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(110,75,255,.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ font: '600 16px/1 var(--font-sans)', color: 'rgba(255,255,255,.9)', margin: 0 }}>
              Suelta la imagen aquí
            </p>
            <p style={{ font: '400 12px/1 var(--font-sans)', color: 'rgba(255,255,255,.45)', margin: 0 }}>
              PNG · JPG · HEIC · MP4 · MOV · WebM
            </p>
          </div>
        )}

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

        {/* Agent panel */}
        {studioView === 'agent' && (
          <aside
            className="absolute right-4 z-10 w-[min(100%-1.5rem,320px)] md:right-6 md:w-[min(100%-3rem,340px)]"
            style={{
              top: '0.75rem',
              bottom: '0.75rem',
              background: 'rgba(18,12,40,0.76)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: '1.25rem',
              boxShadow: '0 30px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <AgentPanel />
          </aside>
        )}

        {/* Side panel */}
        {studioView === 'normal' && <aside
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

            {/* 0 · TEMPLATES — curated scene starting points */}
            <Section
              id="templates"
              title="Templates"
              icon={<TemplateGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint={`${allTemplates.length} escenas`}
              open={openSections.templates}
              onToggle={() => toggleSection('templates')}
            >
              <p
                className="mb-2 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)' }}
              >
                Aplica una escena base. Tus capturas se conservan.
              </p>
              <button
                type="button"
                onClick={() => void handleSaveAsTemplate()}
                className="mb-2 w-full cursor-pointer rounded-lg border-0 py-2"
                style={{
                  background: 'rgba(255,255,255,.08)',
                  color: 'rgba(255,255,255,.85)',
                  font: '600 11px/1 var(--font-sans)',
                  border: '1px solid rgba(255,255,255,.12)',
                }}
              >
                Guardar escena actual ★
              </button>
              <div className="grid grid-cols-2 gap-2">
                {allTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onClick={() => applyTemplate(t)}
                    onDelete={t.id.startsWith('user-') ? () => handleDeleteUserTemplate(t.id) : undefined}
                  />
                ))}
              </div>
            </Section>

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

              <SubLabel className="mt-3">Device wall</SubLabel>
              <p style={{ font: '400 10px/1.4 var(--font-sans)', color: 'rgba(255,255,255,.4)', margin: '0 0 6px' }}>
                Grid de dispositivos con la misma captura.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[3, 4, 6, 9].map((n) => (
                  <Pill key={n} onClick={() => handleCreateDeviceWall(n)} className="px-2.5 py-1">
                    {n}×
                  </Pill>
                ))}
              </div>
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
                  Arrastra, pega (⌘V) o sube · PNG · JPG · HEIC · MP4 · MOV
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

              {screenshot && screenMediaKind !== 'video' && (
                <>
                  <SubLabel className="mt-3">Before / After</SubLabel>
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>
                    <input
                      type="checkbox"
                      checked={activeDevice.comparisonEnabled ?? false}
                      onChange={(e) => updateDevice(activeDevice.id, { comparisonEnabled: e.target.checked })}
                    />
                    Comparación con wipe
                  </label>
                  {activeDevice.comparisonEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => beforeFileRef.current?.click()}
                        className="mt-1 w-full cursor-pointer rounded-lg border-0 py-2 text-xs"
                        style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.75)' }}
                      >
                        {activeDevice.beforeScreenshot ? 'Cambiar imagen "before"' : 'Subir imagen "before"'}
                      </button>
                      <input
                        ref={beforeFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          const r = new FileReader()
                          r.onload = () =>
                            updateDevice(activeDevice.id, { beforeScreenshot: r.result as string })
                          r.readAsDataURL(f)
                          e.target.value = ''
                        }}
                      />
                      <label className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                        <span className="w-14 shrink-0">Split</span>
                        <input
                          type="range"
                          min={0.05}
                          max={0.95}
                          step={0.01}
                          value={activeDevice.comparisonSplit ?? 0.5}
                          onChange={(e) =>
                            updateDevice(activeDevice.id, { comparisonSplit: Number(e.target.value) })
                          }
                          className="min-w-0 flex-1 accent-[var(--accent)]"
                        />
                      </label>
                    </>
                  )}
                </>
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

              <SubLabel className="mt-3">Brand kits</SubLabel>
              <div className="flex flex-wrap gap-1.5">
                {brandKits.map((kit) => (
                  <Pill key={kit.id} onClick={() => handleApplyBrandKit(kit)} className="px-2 py-1">
                    {kit.name}
                  </Pill>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSaveBrandKit}
                className="mt-2 w-full cursor-pointer rounded-lg border-0 py-2 text-xs"
                style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.75)' }}
              >
                Guardar brand kit actual
              </button>
            </Section>
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

              <SubLabel className={devices.length > 1 ? 'mt-3' : ''}>Altura (Y)</SubLabel>
              <label className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                <span className="w-12 shrink-0 tabular-nums">
                  {activeDevice.positionY > 0 ? '+' : ''}{Math.round(activeDevice.positionY)}
                </span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={0.5}
                  value={activeDevice.positionY}
                  onChange={(e) => updateDevice(activeDevice.id, { positionY: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
              </label>

              <SubLabel className="mt-3">Profundidad (Z)</SubLabel>
              <label className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                <span className="w-12 shrink-0 tabular-nums">
                  {activeDevice.positionZ > 0 ? '+' : ''}{Math.round(activeDevice.positionZ)}
                </span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={0.5}
                  value={activeDevice.positionZ}
                  onChange={(e) => updateDevice(activeDevice.id, { positionZ: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
              </label>
              <p
                className="mt-1 mb-0 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                Valores negativos = más alejado. En modo Mover: Alt+arrastre ajusta Z.
              </p>

              <SubLabel className="mt-3">Tamaño</SubLabel>
              <label className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                <span className="w-12 shrink-0 tabular-nums">{activeDevice.deviceScale.toFixed(2)}×</span>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={activeDevice.deviceScale}
                  onChange={(e) => setDeviceScale(activeDevice.id, Number(e.target.value))}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
              </label>

              <SubLabel className="mt-3">
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

              <div className="mt-4 flex items-center justify-between">
                <span
                  style={{
                    font: '600 10px/1 var(--font-sans)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.4)',
                  }}
                >
                  Iluminación
                </span>
                <button
                  type="button"
                  onClick={resetLighting}
                  className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-xs transition"
                  style={{ color: 'rgba(255,255,255,.45)', font: '500 11px/1 var(--font-sans)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,.8)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,.45)' }}
                >
                  Reset
                </button>
              </div>
              {(
                [
                  { label: 'Ambiente HDRI', value: environmentIntensity, set: setEnvironmentIntensity, min: 0, max: 1.5 },
                  { label: 'Luz ambiente', value: ambientIntensity, set: setAmbientIntensity, min: 0, max: 0.6 },
                  { label: 'Luz principal', value: keyLightIntensity, set: setKeyLightIntensity, min: 0, max: 2 },
                ] as const
              ).map(({ label, value, set, min, max }) => (
                <label
                  key={label}
                  className="mt-1.5 flex items-center gap-3 text-xs"
                  style={{ color: 'rgba(255,255,255,.5)' }}
                >
                  <span className="w-24 shrink-0">{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={0.01}
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                    className="min-w-0 flex-1 accent-[var(--accent)]"
                  />
                  <span className="w-9 shrink-0 tabular-nums text-right">{value.toFixed(2)}</span>
                </label>
              ))}

              <div className="mt-4 flex items-center justify-between">
                <span style={{ font: '600 10px/1 var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
                  Sombra
                </span>
                <button type="button" onClick={resetShadow} className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-xs" style={{ color: 'rgba(255,255,255,.45)' }}>
                  Reset
                </button>
              </div>
              {(
                [
                  { label: 'Opacidad', value: shadowOpacity, set: setShadowOpacity, min: 0, max: 1 },
                  { label: 'Blur', value: shadowBlur, set: setShadowBlur, min: 0, max: 8 },
                  { label: 'Distancia', value: shadowFar, set: setShadowFar, min: 4, max: 30 },
                  { label: 'Escala', value: shadowScaleMult, set: setShadowScaleMult, min: 0.5, max: 2 },
                ] as const
              ).map(({ label, value, set, min, max }) => (
                <label key={label} className="mt-1.5 flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                  <span className="w-24 shrink-0">{label}</span>
                  <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => set(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--accent)]" />
                  <span className="w-9 shrink-0 tabular-nums text-right">{value.toFixed(2)}</span>
                </label>
              ))}

              <SubLabel className="mt-4">Logo watermark</SubLabel>
              <input
                type="file"
                accept="image/*"
                className="mb-2 w-full text-xs"
                style={{ color: 'rgba(255,255,255,.55)' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => {
                    const url = r.result as string
                    preloadLogo(url)
                    setLogoWatermark({ url })
                  }
                  r.readAsDataURL(f)
                  e.target.value = ''
                }}
              />
              {logoWatermark.url && (
                <>
                  <label className="mt-1 flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                    <span className="w-24 shrink-0">Opacidad</span>
                    <input type="range" min={0.1} max={1} step={0.05} value={logoWatermark.opacity} onChange={(e) => setLogoWatermark({ opacity: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--accent)]" />
                  </label>
                  <label className="mt-1 flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
                    <span className="w-24 shrink-0">Tamaño</span>
                    <input type="range" min={0.04} max={0.3} step={0.01} value={logoWatermark.scale} onChange={(e) => setLogoWatermark({ scale: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--accent)]" />
                  </label>
                  <button type="button" onClick={() => setLogoWatermark({ url: null })} className="mt-1 border-0 bg-transparent p-0 text-xs cursor-pointer" style={{ color: 'rgba(255,160,180,.85)' }}>
                    Quitar logo
                  </button>
                </>
              )}

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

              <div className="mt-3 flex items-center justify-between">
                <span
                  style={{
                    font: '600 10px/1 var(--font-sans)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.4)',
                  }}
                >
                  Vistas de cámara
                </span>
                <button
                  type="button"
                  onClick={handleSaveCameraPreset}
                  className="cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 transition"
                  style={{ color: 'var(--accent)', font: '600 11px/1 var(--font-sans)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = '' }}
                >
                  + Guardar vista
                </button>
              </div>
              <div className="mb-1 flex flex-wrap gap-1.5">
                {BUILTIN_CAMERA_PRESETS.map((p) => (
                  <Pill
                    key={p.id}
                    onClick={() => applyCameraPreset(p.pose)}
                    className="px-2.5 py-1"
                  >
                    {p.name}
                  </Pill>
                ))}
              </div>
              {userCameraPresets.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {userCameraPresets.map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1"
                      style={{
                        background: 'rgba(255,255,255,.06)',
                        border: '1px solid rgba(255,255,255,.12)',
                        font: '500 12px/1 var(--font-sans)',
                        color: 'rgba(255,255,255,.8)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => applyCameraPreset(p.pose)}
                        className="cursor-pointer border-0 bg-transparent p-0"
                        style={{ color: 'inherit', font: 'inherit' }}
                        title={`Aplicar ${p.name}`}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCameraPreset(p.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 leading-none"
                        style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}
                        aria-label={`Eliminar ${p.name}`}
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

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

            <Section
              id="motion"
              title="Motion"
              icon={<CameraNavGlyph className="h-3.5 w-3.5 shrink-0" />}
              hint="Camera animation"
              open={openSections.motion}
              onToggle={() => toggleSection('motion')}
            >
              <MotionPanel />
              <MotionTimeline />
            </Section>

            <Section
              id="batch"
              title="Batch"
              icon={<DownloadGlyph className="h-4 w-4 shrink-0" />}
              hint="Many PNGs → ZIP"
              open={openSections.batch}
              onToggle={() => toggleSection('batch')}
            >
              <p style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.45)', margin: '0 0 10px' }}>
                Apply one template to many screenshots.
              </p>
              <button
                type="button"
                onClick={() => setBatchOpen(true)}
                className="w-full cursor-pointer rounded-xl border-0 py-2.5"
                style={{ background: 'var(--accent)', color: '#fff', font: '600 12px/1 var(--font-sans)' }}
              >
                Open batch export
              </button>
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

              <SubLabel>Plataforma</SubLabel>
              <div className="mb-1 flex flex-wrap gap-1.5">
                {PLATFORM_EXPORT_PRESETS.map(({ id, label }) => (
                  <Pill
                    key={id}
                    active={platformPresetId === id}
                    onClick={() => {
                      const p = PLATFORM_EXPORT_PRESETS.find((x) => x.id === id)
                      if (!p) return
                      setPlatformPresetId(id)
                      setAspectPreset(p.aspectPreset)
                      if (p.exportLongEdge === 'screen') setExportPreset('screen')
                      else setExportPreset(p.exportLongEdge)
                      setExportError(null)
                    }}
                    className="px-2 py-1.5"
                  >
                    {label}
                  </Pill>
                ))}
              </div>
              <p
                className="mb-3 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                {platformPresetId
                  ? PLATFORM_EXPORT_PRESETS.find((p) => p.id === platformPresetId)?.hint
                  : 'Atajo para App Store, Instagram, X, OG…'}
              </p>

              <SubLabel>Formato (aspect ratio)</SubLabel>
              <div className="mb-1 flex flex-wrap gap-1.5">
                {ASPECT_PRESETS.map(({ id, label }) => (
                  <Pill
                    key={id}
                    active={aspectPreset === id}
                    onClick={() => {
                      setAspectPreset(id)
                      setPlatformPresetId(null)
                      setExportError(null)
                    }}
                    className="px-2.5 py-1.5"
                  >
                    {label}
                  </Pill>
                ))}
              </div>
              <p
                className="mb-3 leading-snug"
                style={{ font: '400 11px/1.45 var(--font-sans)', color: 'rgba(255,255,255,.4)' }}
              >
                {ASPECT_PRESETS.find((p) => p.id === aspectPreset)?.hint}
              </p>

              <SubLabel>Resolución</SubLabel>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {EXPORT_PRESETS.map(({ id, label }) => (
                  <Pill
                    key={String(id)}
                    active={exportPreset === id}
                    onClick={() => {
                      setExportPreset(id)
                      setPlatformPresetId(null)
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
        </aside>}
      </div>
      <ProjectPicker
        open={pickerOpen}
        currentProjectId={activeProject?.id ?? null}
        onPick={switchToProject}
        onCreate={createAndOpen}
        onClose={async () => {
          setPickerOpen(false)
          const id = activeProjectIdRef.current
          if (id) {
            const refreshed = await projectStore.get(id)
            // Guard against a project switch landing mid-refresh.
            if (refreshed && activeProjectIdRef.current === id) setActiveProject(refreshed)
          }
        }}
      />
      {batchOpen && <BatchExportPanel onClose={() => setBatchOpen(false)} />}
      {activeProject && (
        <ProjectHistoryPanel
          projectId={activeProject.id}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onRestore={(snap) => hydrateFromSnapshot(snap)}
        />
      )}
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

function TemplateGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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

const THUMBNAIL_TARGET_HEIGHT = 800
const THUMBNAIL_JPEG_QUALITY = 0.88

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

  // Never crop away more than half the frame — a stale/oversized inset would
  // otherwise capture only a thin edge strip and miss the centered device.
  const visibleFrac = Math.max(0.5, Math.min(1, 1 - (viewportInsetRight || 0)))
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
