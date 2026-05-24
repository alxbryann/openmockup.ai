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

export type ScreenMediaKind = 'image' | 'video'

export type DeviceInstance = {
  id: string
  screenshot: string | null
  /** When `screenshot` is set: image data URL or video blob URL. */
  screenMediaKind: ScreenMediaKind | null
  screenLoadError: string | null
  /** Loop / playback start offset in seconds (video only). */
  videoStartTime: number
  /** Export clip end time in seconds (video only). null = not set. */
  videoEndTime: number | null
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
    screenMediaKind: null,
    screenLoadError: null,
    videoStartTime: 0,
    videoEndTime: null,
    deviceKind: 'phone',
    deviceColor: '#DFCEEA',
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
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  viewportAspect: number
  viewportInsetRight: number
  hydrationSeq: number
  captureSceneAtSize: null | ((width: number, height: number, opts?: { transparent?: boolean; bgCss?: string }) => string)
  captureSceneToCanvas: null | ((width: number, height: number, opts?: { transparent?: boolean; bgCss?: string }) => HTMLCanvasElement)
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
  setCaptureSceneToCanvas: (fn: State['captureSceneToCanvas']) => void
  setBgColor: (c: string) => void
  setAutoRotate: (v: boolean) => void
  setUiTheme: (t: 'dark' | 'light') => void
  setCameraRoll: (radians: number) => void
  toggleCameraPanFree: () => void
  setCameraPanFree: (v: boolean) => void
  setOrbitDistance: (d: number) => void
  setCameraPose: (position: [number, number, number], target: [number, number, number]) => void
  setViewportAspect: (aspect: number) => void
  setViewportInsetRight: (fraction: number) => void
  hydrateFromSnapshot: (snap: {
    devices: DeviceInstance[]
    bgColor: string
    uiTheme: 'dark' | 'light'
    cameraRoll: number
    orbitDistance: number
    autoRotate?: boolean
    cameraPosition?: [number, number, number]
    cameraTarget?: [number, number, number]
    viewportAspect?: number
    viewportInsetRight?: number
  }) => void
}

const firstDevice = makeDevice(0)

export const useStore = create<State>((set) => ({
  devices: [firstDevice],
  activeDeviceId: firstDevice.id,
  bgColor: '#ffffff',
  autoRotate: true,
  uiTheme: 'dark',
  cameraRoll: 0,
  cameraPanFree: false,
  orbitDistance: 28,
  cameraPosition: [0, 0, 28],
  cameraTarget: [0, 0, 0],
  viewportAspect: 1,
  viewportInsetRight: 0,
  hydrationSeq: 0,
  captureSceneAtSize: null,
  captureSceneToCanvas: null,
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
  setCaptureSceneToCanvas: (fn) => set({ captureSceneToCanvas: fn }),
  setBgColor: (c) => set({ bgColor: c }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setUiTheme: (t) => set({ uiTheme: t }),
  setCameraRoll: (radians) => set({ cameraRoll: wrapCameraRoll(radians) }),
  toggleCameraPanFree: () => set((s) => ({ cameraPanFree: !s.cameraPanFree })),
  setCameraPanFree: (v) => set({ cameraPanFree: v }),
  setOrbitDistance: (d) => set({ orbitDistance: d }),
  setCameraPose: (position, target) => set({ cameraPosition: position, cameraTarget: target }),
  setViewportAspect: (aspect) => set({ viewportAspect: aspect }),
  setViewportInsetRight: (fraction) => set({ viewportInsetRight: Math.max(0, Math.min(0.95, fraction)) }),

  hydrateFromSnapshot: (snap) =>
    set((s) => {
      const devices = snap.devices.length > 0 ? snap.devices : [makeDevice(0)]
      return {
        devices: devices.map((d) => ({
          ...d,
          screenMediaKind:
            d.screenMediaKind ?? (d.screenshot ? 'image' : null),
          videoStartTime: d.videoStartTime ?? 0,
          videoEndTime: d.videoEndTime ?? null,
          deviceRotation: [
            wrapSignedPi(d.deviceRotation[0]),
            wrapSignedPi(d.deviceRotation[1]),
            wrapSignedPi(d.deviceRotation[2]),
          ] as [number, number, number],
        })),
        activeDeviceId: devices[0].id,
        bgColor: snap.bgColor,
        uiTheme: snap.uiTheme,
        cameraRoll: wrapCameraRoll(snap.cameraRoll),
        orbitDistance: snap.orbitDistance,
        autoRotate: snap.autoRotate ?? false,
        cameraPosition: snap.cameraPosition ?? [0, 0, snap.orbitDistance],
        cameraTarget: snap.cameraTarget ?? [0, 0, 0],
        viewportAspect: snap.viewportAspect ?? 1,
        viewportInsetRight: snap.viewportInsetRight ?? 0,
        hydrationSeq: s.hydrationSeq + 1,
      }
    }),
}))
