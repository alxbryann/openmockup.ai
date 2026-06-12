import type { AspectPreset, DeviceInstance, DeviceKind, SceneSnapshotPatch } from './store'
import { LIGHTING_DEFAULTS } from './store'
import type { CameraPose } from './cameraPresets'

const DEG = Math.PI / 180

function orbit(azimuthDeg: number, elevationDeg: number, distance: number, rollDeg = 0): CameraPose {
  const a = azimuthDeg * DEG
  const e = elevationDeg * DEG
  return {
    cameraPosition: [
      Math.round(distance * Math.cos(e) * Math.sin(a) * 100) / 100,
      Math.round(distance * Math.sin(e) * 100) / 100,
      Math.round(distance * Math.cos(e) * Math.cos(a) * 100) / 100,
    ],
    cameraTarget: [0, 0, 0],
    orbitDistance: distance,
    cameraRoll: rollDeg * DEG,
  }
}

export type TemplateDevice = {
  deviceKind: DeviceKind
  deviceColor: string
  /** Radians [x, y, z]. */
  deviceRotation: [number, number, number]
  positionX: number
  positionY: number
  positionZ: number
  deviceScale: number
}

export type SceneTemplate = {
  id: string
  name: string
  description: string
  category: 'hero' | 'social' | 'minimal' | 'multi'
  /** CSS background used for the card preview (color or gradient). */
  thumbnail: string
  bgColor: string
  autoRotate: boolean
  aspectPreset: AspectPreset
  camera: CameraPose
  lighting: { environmentIntensity: number; ambientIntensity: number; keyLightIntensity: number }
  devices: TemplateDevice[]
}

const COSMIC = 'linear-gradient(135deg, #4338CA, #7C3AED)'
const VIOLET = 'linear-gradient(135deg, #8B5CF6, #EC4899)'
const NAVY = 'linear-gradient(135deg, #0F172A, #1E3A5F)'
const BLUE = 'linear-gradient(135deg, #3B82F6, #06B6D4)'

function phone(rotY = 0, opts: Partial<TemplateDevice> = {}): TemplateDevice {
  return {
    deviceKind: 'phone',
    deviceColor: '#DFCEEA',
    deviceRotation: [0, rotY * DEG, 0],
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    deviceScale: 1,
    ...opts,
  }
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'hero-tilt',
    name: 'Hero tilt',
    description: 'iPhone inclinado sobre fondo oscuro cósmico. El clásico hero shot.',
    category: 'hero',
    thumbnail: COSMIC,
    bgColor: COSMIC,
    autoRotate: false,
    aspectPreset: 'free',
    camera: orbit(0, 4, 26),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [phone(25, { deviceColor: '#32374A' })],
  },
  {
    id: 'flat-front',
    name: 'Flat front',
    description: 'Vista frontal limpia sobre blanco. Ideal para documentación.',
    category: 'minimal',
    thumbnail: '#ffffff',
    bgColor: '#ffffff',
    autoRotate: false,
    aspectPreset: 'free',
    camera: orbit(0, 0, 28),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [phone(0, { deviceColor: '#353839' })],
  },
  {
    id: 'duo-showcase',
    name: 'Duo showcase',
    description: 'Dos iPhones enfrentados para mostrar dos pantallas a la vez.',
    category: 'multi',
    thumbnail: VIOLET,
    bgColor: VIOLET,
    autoRotate: false,
    aspectPreset: '16:9',
    camera: orbit(0, 6, 36),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [
      phone(18, { positionX: -9, deviceColor: '#DFCEEA' }),
      phone(-18, { positionX: 9, deviceColor: '#96AED1' }),
    ],
  },
  {
    id: 'mac-desk',
    name: 'Mac desk',
    description: 'MacBook con un iPhone al lado, ángulo ligeramente bajo.',
    category: 'multi',
    thumbnail: NAVY,
    bgColor: NAVY,
    autoRotate: false,
    aspectPreset: '16:9',
    camera: orbit(12, -4, 34),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [
      { deviceKind: 'mac', deviceColor: '#353839', deviceRotation: [0, 8 * DEG, 0], positionX: -6, positionY: 0, positionZ: 0, deviceScale: 1 },
      phone(-12, { positionX: 13, deviceColor: '#F5F5F5', deviceScale: 0.9 }),
    ],
  },
  {
    id: 'story-vertical',
    name: 'Story vertical',
    description: 'Formato 9:16 para Stories, Reels y TikTok.',
    category: 'social',
    thumbnail: BLUE,
    bgColor: BLUE,
    autoRotate: false,
    aspectPreset: '9:16',
    camera: orbit(0, 3, 24),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [phone(12, { deviceColor: '#DFCEEA' })],
  },
  {
    id: 'app-store',
    name: 'App Store',
    description: 'Encuadre 16:9 con iPhone inclinado, listo para capturas de tienda.',
    category: 'social',
    thumbnail: '#0a0a0a',
    bgColor: '#0a0a0a',
    autoRotate: false,
    aspectPreset: '16:9',
    camera: orbit(0, 4, 26),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [phone(18, { deviceColor: '#F77E2D' })],
  },
  {
    id: 'minimal-dark',
    name: 'Minimal dark',
    description: 'Negro puro y luz suave para un look premium y sobrio.',
    category: 'minimal',
    thumbnail: '#000000',
    bgColor: '#000000',
    autoRotate: false,
    aspectPreset: 'free',
    camera: orbit(0, 2, 28),
    lighting: { environmentIntensity: 0.5, ambientIntensity: 0.12, keyLightIntensity: 0.85 },
    devices: [phone(0, { deviceColor: '#000000' })],
  },
  {
    id: 'gradient-pop',
    name: 'Gradient pop',
    description: 'Gradiente violeta vibrante con iPhone inclinado.',
    category: 'hero',
    thumbnail: VIOLET,
    bgColor: VIOLET,
    autoRotate: false,
    aspectPreset: '1:1',
    camera: orbit(0, 5, 26),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [phone(20, { deviceColor: '#F5F5F5' })],
  },
  {
    id: 'ipad-hero',
    name: 'iPad hero',
    description: 'iPad landscape on cosmic gradient — great for app demos.',
    category: 'hero',
    thumbnail: COSMIC,
    bgColor: COSMIC,
    autoRotate: false,
    aspectPreset: '16:9',
    camera: orbit(0, 6, 32),
    lighting: { ...LIGHTING_DEFAULTS },
    devices: [{
      deviceKind: 'ipad',
      deviceColor: '#353839',
      deviceRotation: [0, 15 * DEG, 0],
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      deviceScale: 1,
    }],
  },
  {
    id: 'watch-minimal',
    name: 'Watch minimal',
    description: 'Apple Watch on clean white — perfect for watch face mockups.',
    category: 'minimal',
    thumbnail: '#ffffff',
    bgColor: '#ffffff',
    autoRotate: false,
    aspectPreset: '1:1',
    camera: orbit(0, 8, 22),
    lighting: { environmentIntensity: 0.85, ambientIntensity: 0.25, keyLightIntensity: 1.1 },
    devices: [{
      deviceKind: 'watch',
      deviceColor: '#000000',
      deviceRotation: [0, 0, 0],
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      deviceScale: 1.2,
    }],
  },
]

export function getSceneTemplate(id: string): SceneTemplate | undefined {
  return SCENE_TEMPLATES.find((t) => t.id === id)
}

function toDeviceInstance(td: TemplateDevice, carry?: DeviceInstance): DeviceInstance {
  return {
    id: crypto.randomUUID(),
    // Preserve the user's uploaded media when a device slot exists at this index.
    screenshot: carry?.screenshot ?? null,
    screenMediaKind: carry?.screenMediaKind ?? null,
    screenLoadError: null,
    videoStartTime: carry?.videoStartTime ?? 0,
    videoEndTime: carry?.videoEndTime ?? null,
    deviceKind: td.deviceKind,
    deviceColor: td.deviceColor,
    deviceRotation: [...td.deviceRotation] as [number, number, number],
    positionX: td.positionX,
    positionY: td.positionY,
    positionZ: td.positionZ,
    deviceScale: td.deviceScale,
  }
}

/**
 * Build the scene patch for a template, carrying over the user's uploaded
 * screenshots/videos from the current devices (matched by index).
 */
export function buildTemplateSnapshot(t: SceneTemplate, existing: DeviceInstance[]): SceneSnapshotPatch {
  return {
    devices: t.devices.map((td, i) => toDeviceInstance(td, existing[i])),
    bgColor: t.bgColor,
    autoRotate: t.autoRotate,
    aspectPreset: t.aspectPreset,
    cameraPosition: t.camera.cameraPosition,
    cameraTarget: t.camera.cameraTarget,
    orbitDistance: t.camera.orbitDistance,
    cameraRoll: t.camera.cameraRoll,
    environmentIntensity: t.lighting.environmentIntensity,
    ambientIntensity: t.lighting.ambientIntensity,
    keyLightIntensity: t.lighting.keyLightIntensity,
  }
}
