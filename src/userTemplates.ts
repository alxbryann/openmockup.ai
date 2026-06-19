import type { SceneTemplate } from './sceneTemplates'
import { useStore } from './store'

const STORAGE_KEY = 'openmockup.userTemplates.v1'

type Store = { templates: SceneTemplate[] }

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { templates: [] }
    const parsed = JSON.parse(raw) as Store
    return { templates: parsed.templates ?? [] }
  } catch {
    return { templates: [] }
  }
}

function writeStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listUserTemplates(): SceneTemplate[] {
  return readStore().templates
}

export function getUserTemplate(id: string): SceneTemplate | undefined {
  return listUserTemplates().find((t) => t.id === id)
}

export function saveUserTemplate(template: SceneTemplate): SceneTemplate[] {
  const store = readStore()
  store.templates = [template, ...store.templates.filter((t) => t.id !== template.id)]
  writeStore(store)
  return store.templates
}

export function deleteUserTemplate(id: string): SceneTemplate[] {
  const store = readStore()
  store.templates = store.templates.filter((t) => t.id !== id)
  writeStore(store)
  return store.templates
}

/** Capture the current studio scene as a reusable template (no screenshots). */
export function captureSceneAsTemplate(name: string, thumbnail: string): SceneTemplate {
  const s = useStore.getState()
  return {
    id: `user-${crypto.randomUUID()}`,
    name: name.trim() || 'Mi template',
    description: 'Template personalizado',
    category: 'minimal',
    thumbnail,
    bgColor: s.bgColor,
    autoRotate: s.autoRotate,
    aspectPreset: s.aspectPreset,
    camera: {
      cameraPosition: [...s.cameraPosition] as [number, number, number],
      cameraTarget: [...s.cameraTarget] as [number, number, number],
      orbitDistance: s.orbitDistance,
      cameraRoll: s.cameraRoll,
    },
    lighting: {
      environmentIntensity: s.environmentIntensity,
      ambientIntensity: s.ambientIntensity,
      keyLightIntensity: s.keyLightIntensity,
    },
    devices: s.devices.map((d) => ({
      deviceKind: d.deviceKind,
      deviceColor: d.deviceColor,
      deviceRotation: [...d.deviceRotation] as [number, number, number],
      positionX: d.positionX,
      positionY: d.positionY,
      positionZ: d.positionZ,
      deviceScale: d.deviceScale,
    })),
  }
}
