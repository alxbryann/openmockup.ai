/**
 * Headless render API — exposes window.renderMockup() for Playwright automation.
 * Imported by main.tsx so it's bundled into the production build.
 */
import * as THREE from 'three'
import { captureSceneToPngDataUrl } from './highResCapture'
import { isGradientBg } from './gradients'
import { useStore } from './store'

export type RenderMockupDevice = {
  kind?: 'phone' | 'mac'
  imageDataUrl: string
  deviceColor?: string
  deviceRotation?: [number, number, number]
  positionX?: number
  positionY?: number
}

export type RenderMockupOpts = {
  imageDataUrl?: string
  deviceColor?: string
  bgColor?: string
  width?: number
  height?: number
  deviceRotation?: [number, number, number]
  zoom?: number
  /** Adds to camera X before lookAt(origin). Negative ≈ camera left of subject (often shows more right phone edge). */
  camera_offset_x?: number
  /** Adds to camera Y before lookAt(origin). Negative ≈ lower camera (contrapicado / “hero” angle like stock mockups). */
  camera_offset_y?: number
  /** Roll the camera around the Z axis (radians). Matches the cameraRoll store value. */
  camera_roll?: number
  /** Render with transparent background PNG. Ignores bgColor when true. */
  transparent?: boolean
  /** Multi-device scene. Overrides single-device fields when provided. */
  devices?: RenderMockupDevice[]
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    function tick() {
      if (++count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

;(window as any).renderMockup = async function renderMockup(
  opts: RenderMockupOpts,
): Promise<string> {
  const store = useStore.getState()

  // Stop auto-rotate so the device stays at the exact angle we set
  store.setAutoRotate(false)
  if (typeof opts.camera_roll === 'number') store.setCameraRoll(opts.camera_roll)

  // Build the device list — multi-device wins, otherwise synthesize a single device from top-level fields.
  const requested: RenderMockupDevice[] =
    opts.devices && opts.devices.length > 0
      ? opts.devices
      : [
          {
            kind: 'phone',
            imageDataUrl: opts.imageDataUrl ?? '',
            deviceColor: opts.deviceColor,
            deviceRotation: opts.deviceRotation,
          },
        ]

  // Match scene device count to requested count. removeDevice keeps min 1, so the floor is fine.
  while (useStore.getState().devices.length > requested.length) {
    const list = useStore.getState().devices
    useStore.getState().removeDevice(list[list.length - 1].id)
  }
  while (useStore.getState().devices.length < requested.length) {
    useStore.getState().addDevice(requested[useStore.getState().devices.length].kind ?? 'phone')
  }

  // Apply each device's config
  requested.forEach((cfg, i) => {
    const id = useStore.getState().devices[i].id
    useStore.getState().updateDevice(id, {
      deviceKind: cfg.kind ?? 'phone',
      screenshot: cfg.imageDataUrl,
      ...(cfg.deviceColor ? { deviceColor: cfg.deviceColor } : {}),
      ...(cfg.deviceRotation ? { deviceRotation: cfg.deviceRotation } : {}),
      ...(typeof cfg.positionX === 'number' ? { positionX: cfg.positionX } : {}),
      ...(typeof cfg.positionY === 'number' ? { positionY: cfg.positionY } : {}),
    })
  })

  if (opts.bgColor) store.setBgColor(opts.bgColor)

  // Wait for React to reconcile + Three.js to render the new state.
  await waitFrames(6)

  /** Headless capture needs `__mockitCtx`; it registers one frame after Canvas mounts — polling avoids the no-offset fallback. */
  async function waitForMockitCtx(timeoutMs = 8000): Promise<{
    gl: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
  } | null> {
    const t0 = performance.now()
    while (performance.now() - t0 < timeoutMs) {
      const ctx = (window as any).__mockitCtx as {
        gl: THREE.WebGLRenderer
        scene: THREE.Scene
        camera: THREE.PerspectiveCamera
      } | null
      if (ctx?.camera && ctx?.gl && ctx?.scene) return ctx
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    }
    return null
  }

  const w = opts.width ?? 1440
  const h = opts.height ?? 2880
  const zoom = opts.zoom ?? 1

  const ctx = await waitForMockitCtx()

  // Use raw Three.js context for zoom — move camera Z directly so OrbitControls
  // position doesn't interfere. zoom=1 → z=28, zoom>1 → closer, zoom<1 → further.
  if (ctx) {
    const { gl, scene, camera } = ctx
    // Zoom via FOV — camera stays at z=28, FOV widens/narrows the view.
    // zoom=1 → fov=28 (default export look), zoom<1 → wider (more bg), zoom>1 → tighter.
    const origFov = camera.fov
    camera.fov = 28 / Math.max(0.3, Math.min(3, zoom))
    camera.updateProjectionMatrix()

    const ox = opts.camera_offset_x ?? 0
    const oy = opts.camera_offset_y ?? 0
    const savedPos = camera.position.clone()
    const savedQuat = camera.quaternion.clone()
    if (ox !== 0 || oy !== 0) {
      camera.position.set(savedPos.x + ox, savedPos.y + oy, savedPos.z)
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
    }

    const bgCss = opts.bgColor && isGradientBg(opts.bgColor) ? opts.bgColor : undefined
    const captureOpts = opts.transparent
      ? { transparent: true as const }
      : bgCss ? { bgCss } : undefined
    const result = captureSceneToPngDataUrl(gl, scene, camera, w, h, captureOpts)

    if (ox !== 0 || oy !== 0) {
      camera.position.copy(savedPos)
      camera.quaternion.copy(savedQuat)
    }
    camera.fov = origFov
    camera.updateProjectionMatrix()
    return result
  }

  throw new Error('__mockitCtx not ready — Canvas failed to expose gl/scene/camera for headless capture')
}

// Signal readiness once the React app is mounted and the capture function is registered.
function pollReady() {
  const capture = useStore.getState().captureSceneAtSize
  if (capture) {
    ;(window as any).__rendererReady = true
    return
  }
  setTimeout(pollReady, 100)
}
pollReady()
