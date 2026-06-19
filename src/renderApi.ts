/**
 * Headless render API — exposes window.renderMockup() for Playwright automation.
 */
import * as THREE from 'three'
import { captureSceneToPngDataUrl } from './highResCapture'
import { isGradientBg } from './gradients'
import { useStore, type AspectPreset } from './store'
import { getAspectPreset } from './aspectPresets'
import { getBuiltinCameraPreset, type BuiltinCameraPresetId } from './cameraPresets'

export type RenderMockupDevice = {
  kind?: 'phone' | 'mac' | 'ipad' | 'watch'
  imageDataUrl: string
  deviceColor?: string
  deviceRotation?: [number, number, number]
  positionX?: number
  positionY?: number
  positionZ?: number
  deviceScale?: number
}

export type RenderMockupOpts = {
  imageDataUrl?: string
  deviceColor?: string
  bgColor?: string
  width?: number
  height?: number
  deviceRotation?: [number, number, number]
  zoom?: number
  camera_offset_x?: number
  camera_offset_y?: number
  camera_roll?: number
  camera_preset?: BuiltinCameraPresetId
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  orbitDistance?: number
  transparent?: boolean
  aspectPreset?: AspectPreset
  environmentIntensity?: number
  ambientIntensity?: number
  keyLightIntensity?: number
  devices?: RenderMockupDevice[]
  returnFormat?: 'dataUrl' | 'arrayBuffer'
}

export type RenderMockupResult = string | ArrayBuffer

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

function sceneTexturesReady(scene: THREE.Scene, deviceIndex: number): boolean {
  let idx = 0
  let found = false
  let ready = true
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (!mat) continue
      const m = mat as THREE.MeshBasicMaterial
      const map = m.map
      if (!map) continue
      if (idx === deviceIndex) {
        found = true
        const img = map.image as HTMLImageElement | HTMLCanvasElement | undefined
        if (img && 'complete' in img && !img.complete) ready = false
        if (img && 'width' in img && img.width === 0) ready = false
      }
      idx++
    }
  })
  if (!found) {
    const dev = useStore.getState().devices[deviceIndex]
    return Boolean(dev?.screenshot)
  }
  return ready
}

/** Poll until device screen texture is loaded (avoids blank batch PNGs). */
export async function waitForScreenshotReady(
  deviceIndex = 0,
  timeoutMs = 8000,
): Promise<void> {
  const ctx = (window as unknown as { __mockitCtx?: { scene: THREE.Scene } }).__mockitCtx
  const t0 = performance.now()
  while (performance.now() - t0 < timeoutMs) {
    if (ctx?.scene && sceneTexturesReady(ctx.scene, deviceIndex)) return
    await waitFrames(2)
  }
}

export function applySceneConfig(opts: RenderMockupOpts): void {
  const store = useStore.getState()
  store.setAutoRotate(false)
  if (opts.camera_preset) {
    const camPreset = getBuiltinCameraPreset(opts.camera_preset)
    if (camPreset) store.applyCameraPreset(camPreset.pose)
  }
  if (typeof opts.camera_roll === 'number') store.setCameraRoll(opts.camera_roll)
  if (opts.cameraPosition && opts.cameraTarget) {
    store.setCameraPose(opts.cameraPosition, opts.cameraTarget)
    if (typeof opts.orbitDistance === 'number') store.setOrbitDistance(opts.orbitDistance)
  }
  if (opts.aspectPreset) store.setAspectPreset(opts.aspectPreset)
  if (typeof opts.environmentIntensity === 'number') store.setEnvironmentIntensity(opts.environmentIntensity)
  if (typeof opts.ambientIntensity === 'number') store.setAmbientIntensity(opts.ambientIntensity)
  if (typeof opts.keyLightIntensity === 'number') store.setKeyLightIntensity(opts.keyLightIntensity)

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

  while (useStore.getState().devices.length > requested.length) {
    const list = useStore.getState().devices
    useStore.getState().removeDevice(list[list.length - 1].id)
  }
  while (useStore.getState().devices.length < requested.length) {
    useStore.getState().addDevice(requested[useStore.getState().devices.length].kind ?? 'phone')
  }

  requested.forEach((cfg, i) => {
    const id = useStore.getState().devices[i].id
    useStore.getState().updateDevice(id, {
      deviceKind: cfg.kind ?? 'phone',
      screenshot: cfg.imageDataUrl,
      screenMediaKind: 'image',
      ...(cfg.deviceColor ? { deviceColor: cfg.deviceColor } : {}),
      ...(cfg.deviceRotation ? { deviceRotation: cfg.deviceRotation } : {}),
      ...(typeof cfg.positionX === 'number' ? { positionX: cfg.positionX } : {}),
      ...(typeof cfg.positionY === 'number' ? { positionY: cfg.positionY } : {}),
      ...(typeof cfg.positionZ === 'number' ? { positionZ: cfg.positionZ } : {}),
      ...(typeof cfg.deviceScale === 'number' ? { deviceScale: cfg.deviceScale } : {}),
    })
  })

  if (opts.bgColor) store.setBgColor(opts.bgColor)
}

async function waitForMockitCtx(timeoutMs = 8000): Promise<{
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
} | null> {
  const t0 = performance.now()
  while (performance.now() - t0 < timeoutMs) {
    const ctx = (window as unknown as { __mockitCtx?: {
      gl: THREE.WebGLRenderer
      scene: THREE.Scene
      camera: THREE.PerspectiveCamera
    } }).__mockitCtx
    if (ctx?.camera && ctx?.gl && ctx?.scene) return ctx
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  return null
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function renderMockupInternal(opts: RenderMockupOpts): Promise<RenderMockupResult> {
  applySceneConfig(opts)
  await waitFrames(6)
  await waitForScreenshotReady(0)

  const presetDims =
    opts.aspectPreset && opts.aspectPreset !== 'free' ? getAspectPreset(opts.aspectPreset) : null
  const w = opts.width ?? presetDims?.exportW ?? 1440
  const h = opts.height ?? presetDims?.exportH ?? 2880
  const zoom = opts.zoom ?? 1

  const ctx = await waitForMockitCtx()
  if (!ctx) {
    throw new Error('__mockitCtx not ready — Canvas failed to expose gl/scene/camera for headless capture')
  }

  const { gl, scene, camera } = ctx
  const origFov = camera.fov
  camera.fov = 28 / Math.max(0.3, Math.min(3, zoom))
  camera.updateProjectionMatrix()

  const ox = opts.camera_offset_x ?? 0
  const oy = opts.camera_offset_y ?? 0

  if (opts.camera_preset || typeof opts.camera_roll === 'number' || opts.cameraPosition) {
    const s = useStore.getState()
    const [px, py, pz] = s.cameraPosition
    const [tx, ty, tz] = s.cameraTarget
    camera.position.set(px, py, pz)
    camera.lookAt(tx, ty, tz)
    if (s.cameraRoll !== 0) {
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), s.cameraRoll)
      camera.quaternion.multiply(rollQuat)
    }
    camera.updateProjectionMatrix()
  }

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
  const dataUrl = captureSceneToPngDataUrl(gl, scene, camera, w, h, captureOpts)

  if (ox !== 0 || oy !== 0) {
    camera.position.copy(savedPos)
    camera.quaternion.copy(savedQuat)
  }
  camera.fov = origFov
  camera.updateProjectionMatrix()

  if (opts.returnFormat === 'arrayBuffer') return dataUrlToArrayBuffer(dataUrl)
  return dataUrl
}

;(window as unknown as { renderMockup: (opts: RenderMockupOpts) => Promise<string> }).renderMockup =
  async function renderMockup(opts: RenderMockupOpts): Promise<string> {
    const result = await renderMockupInternal({ ...opts, returnFormat: 'dataUrl' })
    return result as string
  }

function pollReady() {
  const capture = useStore.getState().captureSceneAtSize
  if (capture) {
    ;(window as unknown as { __rendererReady: boolean }).__rendererReady = true
    return
  }
  setTimeout(pollReady, 100)
}
pollReady()
