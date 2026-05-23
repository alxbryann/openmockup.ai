import * as THREE from 'three'

export type ScreenMediaKind = 'image' | 'video'

/** Revoke blob URLs created for uploaded videos. */
export function revokeScreenSrc(src: string | null, kind: ScreenMediaKind | null | undefined) {
  if (src && kind === 'video' && src.startsWith('blob:')) {
    URL.revokeObjectURL(src)
  }
}

export function inferScreenMediaKind(file: File): ScreenMediaKind {
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) {
    return 'video'
  }
  return 'image'
}

/** iPhone GLB screen mesh UV window (see PhoneFromGltf). */
const SCREEN_UV_MIN_U = 0.18488599359989166
const SCREEN_UV_MAX_U = 0.5240240097045898
const SCREEN_UV_MIN_V = 0.43885600566864014
const SCREEN_UV_MAX_V = 0.6013180017471313

export function applyPhoneGltfScreenUv(tex: THREE.Texture) {
  const rangeU = SCREEN_UV_MAX_U - SCREEN_UV_MIN_U
  const rangeV = SCREEN_UV_MAX_V - SCREEN_UV_MIN_V
  tex.repeat.set(1 / rangeU, 1 / rangeV)
  tex.offset.set(-SCREEN_UV_MIN_U / rangeU, -SCREEN_UV_MIN_V / rangeV)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
}

/**
 * Draw source into a canvas with the flip + 90° CW rotation the iPhone GLB screen expects.
 * Canvas dimensions are (sourceHeight × sourceWidth).
 */
export function drawPhoneGltfScreenFrame(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const tmp = document.createElement('canvas')
  tmp.width = sw
  tmp.height = sh
  const ctxTmp = tmp.getContext('2d')!
  ctxTmp.translate(sw, 0)
  ctxTmp.scale(-1, 1)
  ctxTmp.drawImage(source, 0, 0, sw, sh)

  const out = target ?? document.createElement('canvas')
  if (out.width !== sh || out.height !== sw) {
    out.width = sh
    out.height = sw
  }
  const ctx = out.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, out.width, out.height)
  ctx.translate(sh, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(tmp, 0, 0)
  return out
}

export function buildPhoneGltfTextureFromImage(screenshot: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = drawPhoneGltfScreenFrame(img, img.naturalWidth, img.naturalHeight)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false
      applyPhoneGltfScreenUv(tex)
      resolve(tex)
    }
    img.onerror = reject
    img.src = screenshot
  })
}

export function createScreenVideoElement(src: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.src = src
  video.loop = false
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  return video
}

export function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('video load failed'))
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('error', onError)
    video.load()
  })
}

export function disposeScreenVideo(video: HTMLVideoElement | null) {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  video.load()
}

export const SCREEN_VIDEO_LOAD_ERROR =
  'No se pudo reproducir el video. Prueba MP4 (H.264) o WebM.'
