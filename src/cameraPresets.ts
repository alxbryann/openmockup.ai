export type CameraPose = {
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  orbitDistance: number
  cameraRoll: number
}

export type CameraPreset = {
  id: string
  name: string
  pose: CameraPose
  builtin?: boolean
}

const DEG = Math.PI / 180

/**
 * Build a camera pose from orbit spherical coordinates around the origin.
 * @param azimuthDeg horizontal angle around the vertical (Y) axis
 * @param elevationDeg vertical angle above the horizon
 * @param distance orbit distance (also the zoom)
 * @param rollDeg camera roll around its view axis
 */
function poseFromOrbit(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  rollDeg = 0,
): CameraPose {
  const a = azimuthDeg * DEG
  const e = elevationDeg * DEG
  const x = distance * Math.cos(e) * Math.sin(a)
  const y = distance * Math.sin(e)
  const z = distance * Math.cos(e) * Math.cos(a)
  return {
    cameraPosition: [
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100,
      Math.round(z * 100) / 100,
    ],
    cameraTarget: [0, 0, 0],
    orbitDistance: distance,
    cameraRoll: rollDeg * DEG,
  }
}

export const BUILTIN_CAMERA_PRESETS: CameraPreset[] = [
  { id: 'front', name: 'Front', builtin: true, pose: poseFromOrbit(0, 0, 34) },
  { id: 'hero', name: 'Hero', builtin: true, pose: poseFromOrbit(25, 8, 32) },
  { id: 'dramatic', name: 'Dramatic', builtin: true, pose: poseFromOrbit(45, 12, 32, -8) },
  { id: 'topdown', name: 'Top lean', builtin: true, pose: poseFromOrbit(20, 30, 36) },
]

export const CAMERA_PRESET_IDS = BUILTIN_CAMERA_PRESETS.map((p) => p.id)
export type BuiltinCameraPresetId = (typeof BUILTIN_CAMERA_PRESETS)[number]['id']

export function getBuiltinCameraPreset(id: string): CameraPreset | undefined {
  return BUILTIN_CAMERA_PRESETS.find((p) => p.id === id)
}

const STORAGE_KEY = 'openmockup.cameraPresets.v1'

export function listUserCameraPresets(): CameraPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CameraPreset[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUserCameraPresets(presets: CameraPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function saveUserCameraPreset(name: string, pose: CameraPose): CameraPreset[] {
  const presets = listUserCameraPresets()
  presets.push({
    id: crypto.randomUUID(),
    name: name.trim() || `Vista ${presets.length + 1}`,
    pose,
  })
  writeUserCameraPresets(presets)
  return presets
}

export function deleteUserCameraPreset(id: string): CameraPreset[] {
  const presets = listUserCameraPresets().filter((p) => p.id !== id)
  writeUserCameraPresets(presets)
  return presets
}
