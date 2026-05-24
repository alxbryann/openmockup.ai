import * as THREE from 'three'
import type { ColorSpace } from 'three'
import { findGradientPreset, drawGradientToCtx } from './gradients'

/** Reads WebGL render target pixels, flips Y, composites over bgCss. Returns HTMLCanvasElement. */
function renderTargetToCanvas(
  gl: THREE.WebGLRenderer,
  rt: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  bgCss?: string,
): HTMLCanvasElement {
  const sceneBuf = new Uint8Array(width * height * 4)
  gl.readRenderTargetPixels(rt, 0, 0, width, height, sceneBuf)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')

  const rowBytes = width * 4

  if (bgCss) {
    const preset = findGradientPreset(bgCss)
    if (preset) {
      drawGradientToCtx(ctx, width, height, preset)
    } else {
      ctx.fillStyle = bgCss
      ctx.fillRect(0, 0, width, height)
    }
    const gradData = ctx.getImageData(0, 0, width, height)
    const gradBuf = gradData.data
    const outData = ctx.createImageData(width, height)
    const out = outData.data
    for (let y = 0; y < height; y++) {
      const sceneRow = (height - 1 - y) * rowBytes
      const otherRow = y * rowBytes
      for (let x = 0; x < width; x++) {
        const si = sceneRow + x * 4
        const gi = otherRow + x * 4
        const oi = otherRow + x * 4
        const sa = sceneBuf[si + 3] / 255
        out[oi]     = Math.round(sceneBuf[si]     * sa + gradBuf[gi]     * (1 - sa))
        out[oi + 1] = Math.round(sceneBuf[si + 1] * sa + gradBuf[gi + 1] * (1 - sa))
        out[oi + 2] = Math.round(sceneBuf[si + 2] * sa + gradBuf[gi + 2] * (1 - sa))
        out[oi + 3] = 255
      }
    }
    ctx.putImageData(outData, 0, 0)
  } else {
    const imageData = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * rowBytes
      const dst = y * rowBytes
      imageData.data.set(sceneBuf.subarray(src, src + rowBytes), dst)
    }
    ctx.putImageData(imageData, 0, 0)
  }

  return canvas
}

/**
 * Renders one frame to an offscreen target at `width` × `height` (same framing as
 * the live view when aspect matches the current canvas).
 */
export type CaptureSceneOptions = {
  /** Opaque studio background vs alpha so the PNG can be composited */
  transparent?: boolean
  /** CSS background string (hex or gradient) for compositing into the export */
  bgCss?: string
}

function renderSceneOffscreen(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  options?: CaptureSceneOptions,
): HTMLCanvasElement {
  const transparent = options?.transparent === true
  const bgCss = options?.bgCss
  const needsBgComposite = !transparent && bgCss != null

  const prevBg = scene.background
  const prevClearColor = new THREE.Color()
  gl.getClearColor(prevClearColor)
  const prevClearAlpha = gl.getClearAlpha()

  if (transparent || needsBgComposite) {
    scene.background = null
    gl.setClearColor(0x000000, 0)
  }

  const ctx = gl.getContext()
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext
  const maxSamples = isWebGL2
    ? Math.min(8, (ctx as WebGL2RenderingContext).getParameter((ctx as WebGL2RenderingContext).MAX_SAMPLES) as number)
    : 0

  const rt = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: gl.outputColorSpace as ColorSpace,
    depthBuffer: true,
    samples: maxSamples,
    anisotropy: gl.capabilities.getMaxAnisotropy(),
  })

  const exportCam = camera.clone() as THREE.PerspectiveCamera
  exportCam.aspect = width / height
  exportCam.updateProjectionMatrix()

  const prevTarget = gl.getRenderTarget()
  const prevXR = gl.xr.enabled
  try {
    gl.xr.enabled = false
    gl.setRenderTarget(rt)
    gl.render(scene, exportCam)
    gl.setRenderTarget(prevTarget)
    gl.xr.enabled = prevXR

    return renderTargetToCanvas(gl, rt, width, height, needsBgComposite ? bgCss : undefined)
  } finally {
    if (transparent || needsBgComposite) {
      scene.background = prevBg
      gl.setClearColor(prevClearColor, prevClearAlpha)
    }
    rt.dispose()
  }
}

export function captureSceneToPngDataUrl(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  options?: CaptureSceneOptions,
): string {
  return renderSceneOffscreen(gl, scene, camera, width, height, options).toDataURL('image/png')
}

/** Same as captureSceneToPngDataUrl but returns the HTMLCanvasElement directly — no PNG encoding. */
export function captureSceneToCanvas(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  options?: CaptureSceneOptions,
): HTMLCanvasElement {
  return renderSceneOffscreen(gl, scene, camera, width, height, options)
}

/** Longest side = `longSide`, other dimension from viewport aspect (CSS pixels). */
export function exportPixelSize(longSide: number, viewW: number, viewH: number): { w: number; h: number } {
  const vw = Math.max(1, viewW)
  const vh = Math.max(1, viewH)
  const aspect = vw / vh
  if (aspect >= 1) {
    const w = longSide
    const h = Math.max(1, Math.round(longSide / aspect))
    return { w, h }
  }
  const h = longSide
  const w = Math.max(1, Math.round(longSide * aspect))
  return { w, h }
}
