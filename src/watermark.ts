import type { LogoWatermark, LogoWatermarkPosition } from './store'

const logoCache = new Map<string, HTMLImageElement>()

export function preloadLogo(url: string): void {
  if (!url || logoCache.has(url)) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  logoCache.set(url, img)
}

function logoPosition(
  position: LogoWatermarkPosition,
  canvasW: number,
  canvasH: number,
  logoW: number,
  logoH: number,
): { x: number; y: number } {
  const pad = Math.round(canvasW * 0.03)
  switch (position) {
    case 'bottom-left':
      return { x: pad, y: canvasH - logoH - pad }
    case 'top-right':
      return { x: canvasW - logoW - pad, y: pad }
    case 'top-left':
      return { x: pad, y: pad }
    case 'center':
      return { x: (canvasW - logoW) / 2, y: (canvasH - logoH) / 2 }
    case 'bottom-right':
    default:
      return { x: canvasW - logoW - pad, y: canvasH - logoH - pad }
  }
}

/** Composite logo onto export canvas (sync — logo must be preloaded). */
export function compositeLogoWatermark(
  canvas: HTMLCanvasElement,
  watermark: LogoWatermark,
): HTMLCanvasElement {
  if (!watermark.url) return canvas
  const img = logoCache.get(watermark.url)
  if (!img?.complete || img.naturalWidth === 0) return canvas

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const logoW = Math.round(canvas.width * watermark.scale)
  const logoH = Math.round((logoW * img.naturalHeight) / img.naturalWidth)
  const { x, y } = logoPosition(watermark.position, canvas.width, canvas.height, logoW, logoH)

  ctx.save()
  ctx.globalAlpha = watermark.opacity
  ctx.drawImage(img, x, y, logoW, logoH)
  ctx.restore()
  return canvas
}
