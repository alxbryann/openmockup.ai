/** Build a canvas texture showing before/after with a vertical wipe split. */
export function buildComparisonCanvas(
  beforeSrc: string,
  afterSrc: string,
  split: number,
  width = 1170,
  height = 2532,
): Promise<HTMLCanvasElement> {
  const clampedSplit = Math.max(0.05, Math.min(0.95, split))

  return Promise.all([loadImage(beforeSrc), loadImage(afterSrc)]).then(([before, after]) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')

    const splitX = Math.round(width * clampedSplit)

    ctx.drawImage(before, 0, 0, splitX, height, 0, 0, splitX, height)
    ctx.drawImage(after, splitX, 0, width - splitX, height, splitX, 0, width - splitX, height)

    // Wipe divider
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = Math.max(2, width * 0.004)
    ctx.beginPath()
    ctx.moveTo(splitX, 0)
    ctx.lineTo(splitX, height)
    ctx.stroke()

    return canvas
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
