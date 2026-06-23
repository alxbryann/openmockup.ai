import type { DeviceInstance, DeviceKind } from './store'

export type DeviceWallOpts = {
  count: number
  kind?: DeviceKind
  cols?: number
  spacing?: number
  /** Copy media from this device onto every wall slot. */
  source?: DeviceInstance
}

/** Grid layout for N identical devices sharing the same screenshot. */
export function buildDeviceWall(opts: DeviceWallOpts): DeviceInstance[] {
  const { count, kind = 'phone', cols, spacing = 10, source } = opts
  const n = Math.max(1, Math.min(12, Math.round(count)))
  const columnCount = cols ?? Math.ceil(Math.sqrt(n))
  const rowCount = Math.ceil(n / columnCount)

  const totalW = (columnCount - 1) * spacing
  const totalH = (rowCount - 1) * spacing
  const startX = -totalW / 2
  const startY = totalH / 2

  return Array.from({ length: n }, (_, i) => {
    const col = i % columnCount
    const row = Math.floor(i / columnCount)
    return {
      id: crypto.randomUUID(),
      screenshot: source?.screenshot ?? null,
      screenMediaKind: source?.screenMediaKind ?? null,
      screenMediaStoragePath: source?.screenMediaStoragePath ?? null,
      screenLoadError: null,
      videoStartTime: source?.videoStartTime ?? 0,
      videoEndTime: source?.videoEndTime ?? null,
      beforeScreenshot: source?.beforeScreenshot ?? null,
      comparisonEnabled: source?.comparisonEnabled ?? false,
      comparisonSplit: source?.comparisonSplit ?? 0.5,
      deviceKind: kind,
      deviceColor: source?.deviceColor ?? '#DFCEEA',
      deviceRotation: [0, 0, 0] as [number, number, number],
      positionX: startX + col * spacing,
      positionY: startY - row * spacing,
      positionZ: 0,
      deviceScale: source?.deviceScale ?? 0.85,
    }
  })
}
