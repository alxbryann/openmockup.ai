import { create } from 'zustand'

const TAU = Math.PI * 2

/** Canonical roll in [-π, π] for stable UI (slider / presets). */
function wrapCameraRoll(radians: number): number {
  let a = radians % TAU
  if (a <= -Math.PI) a += TAU
  if (a > Math.PI) a -= TAU
  return a
}

type State = {
  screenshot: string | null
  screenLoadError: string | null
  deviceColor: string
  bgColor: string
  autoRotate: boolean
  /** App chrome: dark (default) or light UI */
  uiTheme: 'dark' | 'light'
  /** Roll around the view axis (radians), e.g. π = upside down */
  cameraRoll: number
  setScreenshot: (s: string | null) => void
  setScreenLoadError: (s: string | null) => void
  setDeviceColor: (c: string) => void
  setBgColor: (c: string) => void
  setAutoRotate: (v: boolean) => void
  setUiTheme: (t: 'dark' | 'light') => void
  setCameraRoll: (radians: number) => void
}

export const useStore = create<State>((set) => ({
  screenshot: null,
  screenLoadError: null,
  deviceColor: '#1a1a1a',
  bgColor: '#0a0a0a',
  autoRotate: true,
  uiTheme: 'dark',
  cameraRoll: 0,
  setScreenshot: (s) => set({ screenshot: s }),
  setScreenLoadError: (msg) => set({ screenLoadError: msg }),
  setDeviceColor: (c) => set({ deviceColor: c }),
  setBgColor: (c) => set({ bgColor: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setUiTheme: (t) => set({ uiTheme: t }),
  setCameraRoll: (radians) => set({ cameraRoll: wrapCameraRoll(radians) }),
}))
