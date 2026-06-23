import type { LogoWatermark } from './store'

export type BrandKit = {
  id: string
  name: string
  bgColor: string
  deviceColor: string
  colors: string[]
  logoUrl?: string | null
  logoOpacity?: number
  logoScale?: number
}

const STORAGE_KEY = 'openmockup.brandKits.v1'

function readStore(): BrandKit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultKits()
    const parsed = JSON.parse(raw) as BrandKit[]
    return parsed.length > 0 ? parsed : defaultKits()
  } catch {
    return defaultKits()
  }
}

function writeStore(kits: BrandKit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kits))
}

function defaultKits(): BrandKit[] {
  return [
    {
      id: 'default-light',
      name: 'Clean light',
      bgColor: '#ffffff',
      deviceColor: '#353839',
      colors: ['#ffffff', '#f4f4f5', '#353839', '#0a0a0a'],
    },
    {
      id: 'default-dark',
      name: 'Midnight',
      bgColor: '#0a0a0a',
      deviceColor: '#F5F5F5',
      colors: ['#0a0a0a', '#0f172a', '#32374A', '#F5F5F5'],
    },
    {
      id: 'default-cosmic',
      name: 'Cosmic',
      bgColor: 'linear-gradient(135deg, #4338CA, #7C3AED)',
      deviceColor: '#DFCEEA',
      colors: ['#4338CA', '#7C3AED', '#DFCEEA', '#ffffff'],
    },
  ]
}

export function listBrandKits(): BrandKit[] {
  return readStore()
}

export function saveBrandKit(kit: BrandKit): BrandKit[] {
  const kits = readStore()
  const next = [kit, ...kits.filter((k) => k.id !== kit.id)]
  writeStore(next)
  return next
}

export function deleteBrandKit(id: string): BrandKit[] {
  const next = readStore().filter((k) => k.id !== id)
  writeStore(next)
  return next
}

export function captureBrandKitFromScene(name: string): BrandKit {
  // Lazy import avoided — caller passes values from store
  return {
    id: `brand-${crypto.randomUUID()}`,
    name: name.trim() || 'Mi brand kit',
    bgColor: '#ffffff',
    deviceColor: '#DFCEEA',
    colors: [],
  }
}

export function brandKitToWatermark(kit: BrandKit): LogoWatermark | null {
  if (!kit.logoUrl) return null
  return {
    url: kit.logoUrl,
    opacity: kit.logoOpacity ?? 0.85,
    scale: kit.logoScale ?? 0.12,
    position: 'bottom-right',
  }
}
