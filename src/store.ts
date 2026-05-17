import { create } from 'zustand'

const TAU = Math.PI * 2

function wrapCameraRoll(radians: number): number {
  let a = radians % TAU
  if (a <= -Math.PI) a += TAU
  if (a > Math.PI) a -= TAU
  return a
}

function wrapSignedPi(radians: number): number {
  return wrapCameraRoll(radians)
}

export type DeviceKind = 'phone' | 'mac'

export type DeviceInstance = {
  id: string
  screenshot: string | null
  screenLoadError: string | null
  deviceKind: DeviceKind
  deviceColor: string
  deviceRotation: [number, number, number]
  positionX: number
  positionY: number
}

function makeDevice(positionX = 0): DeviceInstance {
  return {
    id: crypto.randomUUID(),
    screenshot: null,
    screenLoadError: null,
    deviceKind: 'phone',
    deviceColor: '#bfbdb8',
    deviceRotation: [0, 0, 0],
    positionX,
    positionY: 0,
  }
}

type State = {
  devices: DeviceInstance[]
  activeDeviceId: string
  bgColor: string
  autoRotate: boolean
  uiTheme: 'dark' | 'light'
  cameraRoll: number
  cameraPanFree: boolean
  orbitDistance: number
  captureSceneAtSize: null | ((width: number, height: number, opts?: { transparent?: boolean }) => string)
  deviceDragMode: 'rotate' | 'move'
  setDeviceDragMode: (m: 'rotate' | 'move') => void
  addDevice: (kind?: DeviceKind) => void
  removeDevice: (id: string) => void
  setActiveDeviceId: (id: string) => void
  updateDevice: (id: string, patch: Partial<Omit<DeviceInstance, 'id'>>) => void
  setDeviceRotation: (id: string, r: [number, number, number]) => void
  setDeviceRotationAxis: (id: string, axis: 0 | 1 | 2, radians: number) => void
  resetDeviceRotation: (id: string) => void
  tickAutoRotate: (step: number) => void
  setCaptureSceneAtSize: (fn: State['captureSceneAtSize']) => void
  setBgColor: (c: string) => void
  setAutoRotate: (v: boolean) => void
  setUiTheme: (t: 'dark' | 'light') => void
  setCameraRoll: (radians: number) => void
  toggleCameraPanFree: () => void
  setCameraPanFree: (v: boolean) => void
  setOrbitDistance: (d: number) => void
}

const firstDevice = makeDevice(0)

export const useStore = create<State>((set) => ({
  devices: [firstDevice],
  activeDeviceId: firstDevice.id,
  bgColor: '#0a0a0a',
  autoRotate: true,
  uiTheme: 'dark',
  cameraRoll: 0,
  cameraPanFree: false,
  orbitDistance: 28,
  captureSceneAtSize: null,
  deviceDragMode: 'rotate',
  setDeviceDragMode: (m) => set({ deviceDragMode: m }),

  addDevice: (kind = 'phone') =>
    set((s) => {
      const lastX = s.devices.length > 0 ? s.devices[s.devices.length - 1].positionX : 0
      const newDevice = { ...makeDevice(lastX + 14), deviceKind: kind }
      return { devices: [...s.devices, newDevice], activeDeviceId: newDevice.id }
    }),

  removeDevice: (id) =>
    set((s) => {
      if (s.devices.length <= 1) return s
      const idx = s.devices.findIndex((d) => d.id === id)
      const next = s.devices.filter((d) => d.id !== id)
      const nextActiveId =
        s.activeDeviceId === id
          ? (next[Math.max(0, idx - 1)] ?? next[0]).id
          : s.activeDeviceId
      return { devices: next, activeDeviceId: nextActiveId }
    }),

  setActiveDeviceId: (id) => set({ activeDeviceId: id }),

  updateDevice: (id, patch) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  setDeviceRotation: (id, r) =>
    set((s) => ({
      devices: s.devices.map((d) =>
        d.id === id
          ? { ...d, deviceRotation: [wrapSignedPi(r[0]), wrapSignedPi(r[1]), wrapSignedPi(r[2])] }
          : d,
      ),
    })),

  setDeviceRotationAxis: (id, axis, radians) =>
    set((s) => ({
      devices: s.devices.map((d) => {
        if (d.id !== id) return d
        const next: [number, number, number] = [...d.deviceRotation]
        next[axis] = wrapSignedPi(radians)
        return { ...d, deviceRotation: next }
      }),
    })),

  resetDeviceRotation: (id) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id ? { ...d, deviceRotation: [0, 0, 0] } : d)),
    })),

  tickAutoRotate: (step) =>
    set((s) => ({
      devices: s.devices.map((d) => ({
        ...d,
        deviceRotation: [
          d.deviceRotation[0],
          wrapSignedPi(d.deviceRotation[1] + step),
          d.deviceRotation[2],
        ],
      })),
    })),

  setCaptureSceneAtSize: (fn) => set({ captureSceneAtSize: fn }),
  setBgColor: (c) => set({ bgColor: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setUiTheme: (t) => set({ uiTheme: t }),
  setCameraRoll: (radians) => set({ cameraRoll: wrapCameraRoll(radians) }),
  toggleCameraPanFree: () => set((s) => ({ cameraPanFree: !s.cameraPanFree })),
  setCameraPanFree: (v) => set({ cameraPanFree: v }),
  setOrbitDistance: (d) => set({ orbitDistance: d }),
}))
