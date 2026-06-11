import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { seekVideoTo } from './highResVideoExport'

export type GifExportProgress = {
  frame: number
  totalFrames: number
  ratio: number
}

/** GIFs balloon fast, so cap the long edge well below the PNG/video presets. */
const GIF_MAX_LONG_EDGE = 1080

function gifOutputSize(
  longEdge: number,
  viewW: number,
  viewH: number,
): { w: number; h: number } {
  const aspect = Math.max(0.01, viewW / Math.max(1, viewH))
  const capped = Math.min(longEdge, GIF_MAX_LONG_EDGE)
  if (aspect >= 1) return { w: capped, h: Math.max(2, Math.round(capped / aspect)) }
  return { w: Math.max(2, Math.round(capped * aspect)), h: capped }
}

function readCanvasRgba(canvas: HTMLCanvasElement, w: number, h: number): Uint8ClampedArray {
  const ctx = canvas.getContext('2d')
  if (ctx && canvas.width === w && canvas.height === h) {
    return ctx.getImageData(0, 0, w, h).data
  }
  // The captured canvas may be a different element/size — normalize via a scratch canvas.
  const scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const sctx = scratch.getContext('2d')
  if (!sctx) throw new Error('2D context unavailable')
  sctx.drawImage(canvas, 0, 0, w, h)
  return sctx.getImageData(0, 0, w, h).data
}

/**
 * Export the in-device video clip as an animated GIF.
 *
 * Reuses the same frame-by-frame seek + offscreen capture pipeline as the MP4
 * exporter, but encodes each frame with a per-frame optimized palette (gifenc).
 */
export async function exportVideoToGif(opts: {
  videoElement: HTMLVideoElement
  captureFrame: (w: number, h: number, opts?: { transparent?: boolean; bgCss?: string }) => HTMLCanvasElement
  bgCss: string
  longEdge: number
  outputSize?: { w: number; h: number }
  viewW: number
  viewH: number
  fps?: number
  startTime: number
  endTime: number
  onProgress: (p: GifExportProgress) => void
  signal?: AbortSignal
}): Promise<void> {
  const {
    videoElement,
    captureFrame,
    bgCss,
    longEdge,
    outputSize,
    viewW,
    viewH,
    fps = 15,
    startTime,
    endTime,
    onProgress,
    signal,
  } = opts

  const clipDuration = endTime - startTime
  if (clipDuration <= 0) throw new Error('Rango inválido')

  const effectiveFps = Math.max(1, Math.min(30, Math.round(fps)))
  const totalFrames = Math.ceil(clipDuration * effectiveFps)
  if (totalFrames === 0) throw new Error('Sin frames para exportar')

  let { w, h } = outputSize ?? gifOutputSize(longEdge, viewW, viewH)
  // Respect the GIF size cap even when a fixed-aspect outputSize is supplied.
  const longest = Math.max(w, h)
  if (longest > GIF_MAX_LONG_EDGE) {
    const scale = GIF_MAX_LONG_EDGE / longest
    w = Math.max(2, Math.round(w * scale))
    h = Math.max(2, Math.round(h * scale))
  }

  const encoder = GIFEncoder()
  const delay = Math.round(1000 / effectiveFps)

  const wasPlaying = !videoElement.paused
  videoElement.pause()

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('Exportación cancelada')

      const targetTime = Math.min(startTime + i / effectiveFps, endTime)
      await seekVideoTo(videoElement, targetTime)

      const frameCanvas = captureFrame(w, h, { bgCss })
      const rgba = readCanvasRgba(frameCanvas, w, h)

      const palette = quantize(rgba, 256)
      const index = applyPalette(rgba, palette)
      encoder.writeFrame(index, w, h, { palette, delay, repeat: 0 })

      onProgress({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames })
      // Yield so the progress UI can paint between frames.
      await new Promise((r) => setTimeout(r, 0))
    }

    encoder.finish()
    const blob = new Blob([encoder.bytes() as BlobPart], { type: 'image/gif' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openmockup-${Date.now()}.gif`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } finally {
    if (wasPlaying) {
      videoElement.currentTime = startTime
      void videoElement.play().catch(() => {})
    }
  }
}
