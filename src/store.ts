import { create } from 'zustand'

const TAU = Math.PI * 2

/** Canonical roll in [-π, π] for stable UI (slider / presets). */
function wrapCameraRoll(radians: number): number {
  let a = radians % TAU
  if (a <= -Math.PI) a += TAU
  if (a > Math.PI) a -= TAU
  return a
}

/** Same as roll wrapping, for any Euler component shown on ±180° sliders. */
function wrapSignedPi(radians: number): number {
  return wrapCameraRoll(radians)
}

export type DeviceKind = 'phone' | 'mac'

type State = {
  screenshot: string | null
  screenLoadError: string | null
  deviceKind: DeviceKind
  deviceColor: string
  bgColor: string
  autoRotate: boolean
  /** App chrome: dark (default) or light UI */
  uiTheme: 'dark' | 'light'
  /** Roll around the view axis (radians), e.g. π = upside down */
  cameraRoll: number
  /** Euler rotation of the phone model (radians), order XYZ — inclinación / giro / balanceo. */
  deviceRotation: [number, number, number]
  /** H key: allow screen-space pan (XY) on the orbit target */
  cameraPanFree: boolean
  /** Set by Scene; renders offscreen at exact pixel size. */
  captureSceneAtSize: null | ((width: number, height: number) => string)
  setCaptureSceneAtSize: (fn: State['captureSceneAtSize']) => void
  setScreenshot: (s: string | null) => void
  setScreenLoadError: (s: string | null) => void
  setDeviceKind: (k: DeviceKind) => void
  setDeviceColor: (c: string) => void
  setBgColor: (c: string) => void
  setAutoRotate: (v: boolean) => void
  setUiTheme: (t: 'dark' | 'light') => void
  setCameraRoll: (radians: number) => void
  setDeviceRotationAxis: (axis: 0 | 1 | 2, radians: number) => void
  resetDeviceRotation: () => void
  toggleCameraPanFree: () => void
  setCameraPanFree: (v: boolean) => void
}

export const useStore = create<State>((set) => ({
  screenshot: null,
  screenLoadError: null,
  deviceKind: 'phone',
  deviceColor: '#1a1a1a',
  bgColor: '#0a0a0a',
  autoRotate: true,
  uiTheme: 'dark',
  cameraRoll: 0,
  deviceRotation: [0, 0, 0],
  cameraPanFree: false,
  captureSceneAtSize: null,
  setCaptureSceneAtSize: (fn) => set({ captureSceneAtSize: fn }),
  setScreenshot: (s) => set({ screenshot: s }),
  setScreenLoadError: (msg) => set({ screenLoadError: msg }),
  setDeviceKind: (k) => set({ deviceKind: k }),
  setDeviceColor: (c) => set({ deviceColor: c }),
  setBgColor: (c) => set({ bgColor: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setUiTheme: (t) => set({ uiTheme: t }),
  setCameraRoll: (radians) => set({ cameraRoll: wrapCameraRoll(radians) }),
  setDeviceRotationAxis: (axis, radians) =>
    set((s) => {
      const next: [number, number, number] = [...s.deviceRotation]
      next[axis] = wrapSignedPi(radians)
      return { deviceRotation: next }
    }),
  resetDeviceRotation: () => set({ deviceRotation: [0, 0, 0] }),
  toggleCameraPanFree: () => set((s) => ({ cameraPanFree: !s.cameraPanFree })),
  setCameraPanFree: (v) => set({ cameraPanFree: v }),
}))
