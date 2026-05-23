import { create } from 'zustand'

export type DeviceVideoRuntime = {
  duration: number
  currentTime: number
  playing: boolean
  ready: boolean
}

const videoElements = new Map<string, HTMLVideoElement>()

const emptyRuntime = (): DeviceVideoRuntime => ({
  duration: 0,
  currentTime: 0,
  playing: false,
  ready: false,
})

type VideoScreenBridgeState = {
  runtimeByDevice: Record<string, DeviceVideoRuntime>
  patchRuntime: (deviceId: string, patch: Partial<DeviceVideoRuntime>) => void
  clearRuntime: (deviceId: string) => void
  registerVideo: (deviceId: string, video: HTMLVideoElement) => void
  unregisterVideo: (deviceId: string) => void
  seek: (deviceId: string, time: number) => void
  setPlaying: (deviceId: string, playing: boolean) => void
  togglePlaying: (deviceId: string) => void
}

export const useVideoScreenBridge = create<VideoScreenBridgeState>((set, get) => ({
  runtimeByDevice: {},

  patchRuntime: (deviceId, patch) =>
    set((s) => ({
      runtimeByDevice: {
        ...s.runtimeByDevice,
        [deviceId]: { ...(s.runtimeByDevice[deviceId] ?? emptyRuntime()), ...patch },
      },
    })),

  clearRuntime: (deviceId) =>
    set((s) => {
      const next = { ...s.runtimeByDevice }
      delete next[deviceId]
      return { runtimeByDevice: next }
    }),

  registerVideo: (deviceId, video) => {
    videoElements.set(deviceId, video)
    get().patchRuntime(deviceId, {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      currentTime: video.currentTime,
      playing: !video.paused,
      ready: video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    })
  },

  unregisterVideo: (deviceId) => {
    videoElements.delete(deviceId)
    get().clearRuntime(deviceId)
  },

  seek: (deviceId, time) => {
    const video = videoElements.get(deviceId)
    if (!video) return
    const d = Number.isFinite(video.duration) ? video.duration : 0
    const t = Math.max(0, d > 0 ? Math.min(time, d) : time)
    video.currentTime = t
    get().patchRuntime(deviceId, { currentTime: t, duration: d })
  },

  setPlaying: (deviceId, playing) => {
    const video = videoElements.get(deviceId)
    if (!video) return
    if (playing) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
    get().patchRuntime(deviceId, { playing })
  },

  togglePlaying: (deviceId) => {
    const rt = get().runtimeByDevice[deviceId]
    get().setPlaying(deviceId, !(rt?.playing ?? false))
  },
}))

export function getDeviceScreenVideo(deviceId: string): HTMLVideoElement | undefined {
  return videoElements.get(deviceId)
}
