import type { CameraPose } from './cameraPresets'

const DEG = Math.PI / 180

function poseFromOrbit(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  rollDeg = 0,
  target: [number, number, number] = [0, 0, 0],
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
    cameraTarget: [...target] as [number, number, number],
    orbitDistance: distance,
    cameraRoll: rollDeg * DEG,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    cameraPosition: [
      lerp(a.cameraPosition[0], b.cameraPosition[0], t),
      lerp(a.cameraPosition[1], b.cameraPosition[1], t),
      lerp(a.cameraPosition[2], b.cameraPosition[2], t),
    ],
    cameraTarget: [
      lerp(a.cameraTarget[0], b.cameraTarget[0], t),
      lerp(a.cameraTarget[1], b.cameraTarget[1], t),
      lerp(a.cameraTarget[2], b.cameraTarget[2], t),
    ],
    orbitDistance: lerp(a.orbitDistance, b.orbitDistance, t),
    cameraRoll: lerp(a.cameraRoll, b.cameraRoll, t),
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export type CameraMotionPresetId =
  | 'orbit_in'
  | 'orbit_out'
  | 'hero_sweep'
  | 'dolly_pan'
  | 'device_turntable'

export type CameraMotionPreset = {
  id: CameraMotionPresetId
  name: string
  defaultDurationSec: number
  /** device_turntable animates devices, not camera */
  animatesCamera: boolean
  evaluate: (t: number, startPose: CameraPose) => CameraPose
}

export const CAMERA_MOTION_PRESETS: CameraMotionPreset[] = [
  {
    id: 'orbit_in',
    name: 'Orbit in',
    defaultDurationSec: 5,
    animatesCamera: true,
    evaluate: (t, _start) => {
      const eased = easeInOutCubic(Math.min(1, Math.max(0, t)))
      const from = poseFromOrbit(0, 4, 50)
      const to = poseFromOrbit(0, 4, 26)
      return lerpPose(from, to, eased)
    },
  },
  {
    id: 'orbit_out',
    name: 'Orbit out',
    defaultDurationSec: 5,
    animatesCamera: true,
    evaluate: (t) => {
      const eased = easeInOutCubic(Math.min(1, Math.max(0, t)))
      const from = poseFromOrbit(0, 4, 26)
      const to = poseFromOrbit(0, 4, 50)
      return lerpPose(from, to, eased)
    },
  },
  {
    id: 'hero_sweep',
    name: 'Hero sweep',
    defaultDurationSec: 6,
    animatesCamera: true,
    evaluate: (t) => {
      const eased = easeInOutCubic(Math.min(1, Math.max(0, t)))
      const from = poseFromOrbit(0, 4, 32)
      const to = poseFromOrbit(40, 12, 30)
      return lerpPose(from, to, eased)
    },
  },
  {
    id: 'dolly_pan',
    name: 'Dolly pan',
    defaultDurationSec: 5,
    animatesCamera: true,
    evaluate: (t, start) => {
      const eased = easeInOutCubic(Math.min(1, Math.max(0, t)))
      const from = { ...start, cameraTarget: [0, 0, 0] as [number, number, number] }
      const to = {
        ...start,
        cameraTarget: [2, 1, 0] as [number, number, number],
        cameraPosition: [
          start.cameraPosition[0] + 2,
          start.cameraPosition[1] + 0.5,
          start.cameraPosition[2],
        ] as [number, number, number],
      }
      return lerpPose(from, to, eased)
    },
  },
  {
    id: 'device_turntable',
    name: 'Device turntable',
    defaultDurationSec: 8,
    animatesCamera: false,
    evaluate: (_t, start) => start,
  },
]

export function getCameraMotionPreset(id: string): CameraMotionPreset | undefined {
  return CAMERA_MOTION_PRESETS.find((p) => p.id === id)
}

/** Evaluate camera pose at normalized time 0–1 */
export function evaluateCameraMotion(
  presetId: string,
  t: number,
  startPose: CameraPose,
): CameraPose {
  const preset = getCameraMotionPreset(presetId)
  if (!preset) return startPose
  return preset.evaluate(t, startPose)
}

/** Cubic Hermite interpolation between keyframes (t in seconds) */
export type CameraKeyframe = {
  time: number
  pose: CameraPose
}

export function evaluateCameraKeyframes(keyframes: CameraKeyframe[], timeSec: number): CameraPose {
  if (keyframes.length === 0) {
    return poseFromOrbit(0, 4, 28)
  }
  if (keyframes.length === 1) return keyframes[0].pose
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (timeSec <= sorted[0].time) return sorted[0].pose
  if (timeSec >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].pose

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (timeSec >= a.time && timeSec <= b.time) {
      const local = (timeSec - a.time) / (b.time - a.time)
      return lerpPose(a.pose, b.pose, easeInOutCubic(local))
    }
  }
  return sorted[sorted.length - 1].pose
}

export type DeviceKeyframe = {
  time: number
  deviceRotation: [number, number, number]
}

export function evaluateDeviceRotationKeyframes(
  keyframes: DeviceKeyframe[],
  timeSec: number,
  fallback: [number, number, number],
): [number, number, number] {
  if (keyframes.length === 0) return fallback
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  if (timeSec <= sorted[0].time) return sorted[0].deviceRotation
  if (timeSec >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].deviceRotation
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (timeSec >= a.time && timeSec <= b.time) {
      const local = (timeSec - a.time) / (b.time - a.time)
      const t = easeInOutCubic(local)
      return [
        lerp(a.deviceRotation[0], b.deviceRotation[0], t),
        lerp(a.deviceRotation[1], b.deviceRotation[1], t),
        lerp(a.deviceRotation[2], b.deviceRotation[2], t),
      ]
    }
  }
  return fallback
}
