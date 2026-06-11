import type { AspectPreset } from './store'

export type AspectPresetDef = {
  id: AspectPreset
  label: string
  hint: string
  /** width / height ratio. `null` = follow the live viewport (free). */
  ratio: number | null
  /** Suggested export dimensions for the "Screen" preset fallback. */
  exportW: number
  exportH: number
}

export const ASPECT_PRESETS: AspectPresetDef[] = [
  { id: 'free', label: 'Libre', hint: 'sigue el viewport', ratio: null, exportW: 1920, exportH: 1080 },
  { id: '1:1', label: '1:1', hint: 'Instagram post · 1080×1080', ratio: 1, exportW: 1080, exportH: 1080 },
  { id: '4:5', label: '4:5', hint: 'Instagram retrato · 1080×1350', ratio: 4 / 5, exportW: 1080, exportH: 1350 },
  { id: '9:16', label: '9:16', hint: 'Stories / Reels / TikTok · 1080×1920', ratio: 9 / 16, exportW: 1080, exportH: 1920 },
  { id: '16:9', label: '16:9', hint: 'YouTube / X · 1920×1080', ratio: 16 / 9, exportW: 1920, exportH: 1080 },
  { id: 'og', label: 'OG', hint: 'Open Graph · 1200×630', ratio: 1200 / 630, exportW: 1200, exportH: 630 },
]

export function getAspectPreset(id: AspectPreset): AspectPresetDef {
  return ASPECT_PRESETS.find((p) => p.id === id) ?? ASPECT_PRESETS[0]
}

/** Ratio (w/h) for a preset, or `null` for free. */
export function aspectRatioOf(id: AspectPreset): number | null {
  return getAspectPreset(id).ratio
}

/**
 * Resolve export pixel dimensions honoring the active aspect preset.
 *
 * - `free`: longest side = `longSide`, other dimension from the live viewport.
 * - fixed preset: lock to the preset ratio; longest side = `longSide`.
 * - `'screen'` longSide: use the preset's native dimensions (or the viewport for free).
 */
export function resolveExportDimensions(
  aspectPreset: AspectPreset,
  longSide: number | 'screen',
  viewW: number,
  viewH: number,
): { w: number; h: number } {
  const preset = getAspectPreset(aspectPreset)
  const ratio = preset.ratio ?? Math.max(0.01, viewW / Math.max(1, viewH))

  if (longSide === 'screen') {
    if (preset.ratio === null) {
      return { w: Math.max(1, Math.round(viewW)), h: Math.max(1, Math.round(viewH)) }
    }
    return { w: preset.exportW, h: preset.exportH }
  }

  if (ratio >= 1) {
    return { w: longSide, h: Math.max(1, Math.round(longSide / ratio)) }
  }
  return { w: Math.max(1, Math.round(longSide * ratio)), h: longSide }
}
