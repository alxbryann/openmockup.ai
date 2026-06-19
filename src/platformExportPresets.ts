import type { AspectPreset } from './store'

export type PlatformExportPreset = {
  id: string
  label: string
  platform: string
  aspectPreset: AspectPreset
  /** Long edge in px, or 'screen' for native preset dimensions. */
  exportLongEdge: 'screen' | 1920 | 3840
  hint: string
}

export const PLATFORM_EXPORT_PRESETS: PlatformExportPreset[] = [
  {
    id: 'app-store-iphone',
    label: 'App Store iPhone',
    platform: 'Apple',
    aspectPreset: '9:16',
    exportLongEdge: 3840,
    hint: '9:16 · 2160×3840 — capturas de iPhone en App Store Connect',
  },
  {
    id: 'app-store-ipad',
    label: 'App Store iPad',
    platform: 'Apple',
    aspectPreset: '4:5',
    exportLongEdge: 3840,
    hint: '4:5 · 3072×3840 — capturas de iPad en App Store Connect',
  },
  {
    id: 'play-store-feature',
    label: 'Play Store feature',
    platform: 'Google',
    aspectPreset: '16:9',
    exportLongEdge: 3840,
    hint: '16:9 · 3840×2160 — gráfico destacado de Google Play',
  },
  {
    id: 'instagram-post',
    label: 'Instagram post',
    platform: 'Instagram',
    aspectPreset: '1:1',
    exportLongEdge: 1920,
    hint: '1:1 · 1080×1080 — feed de Instagram',
  },
  {
    id: 'instagram-story',
    label: 'Instagram Story',
    platform: 'Instagram',
    aspectPreset: '9:16',
    exportLongEdge: 1920,
    hint: '9:16 · 1080×1920 — Stories y Reels',
  },
  {
    id: 'twitter-post',
    label: 'X / Twitter',
    platform: 'X',
    aspectPreset: '16:9',
    exportLongEdge: 1920,
    hint: '16:9 · 1920×1080 — posts en X',
  },
  {
    id: 'product-hunt',
    label: 'Product Hunt',
    platform: 'Product Hunt',
    aspectPreset: 'og',
    exportLongEdge: 'screen',
    hint: 'OG · 1200×630 — galería de Product Hunt',
  },
  {
    id: 'og-image',
    label: 'Open Graph',
    platform: 'Web',
    aspectPreset: 'og',
    exportLongEdge: 'screen',
    hint: 'OG · 1200×630 — meta og:image y link previews',
  },
]

export function getPlatformExportPreset(id: string): PlatformExportPreset | undefined {
  return PLATFORM_EXPORT_PRESETS.find((p) => p.id === id)
}
