import { useEffect } from 'react'
import { useStore } from './store'
import { useVideoScreenBridge } from './videoScreenBridge'

const LOOP_EPS = 0.05

/**
 * Registers a screen video for timeline UI + custom loop from `videoStartTime`.
 */
export function useDeviceScreenVideo(deviceId: string, video: HTMLVideoElement | null) {
  const registerVideo = useVideoScreenBridge((s) => s.registerVideo)
  const unregisterVideo = useVideoScreenBridge((s) => s.unregisterVideo)
  const patchRuntime = useVideoScreenBridge((s) => s.patchRuntime)

  useEffect(() => {
    if (!video) return

    video.loop = false

    const syncMeta = () => {
      patchRuntime(deviceId, {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        currentTime: video.currentTime,
        ready: true,
      })
    }

    const onTimeUpdate = () => {
      const device = useStore.getState().devices.find((d) => d.id === deviceId)
      const start = device?.videoStartTime ?? 0
      const d = video.duration
      if (Number.isFinite(d) && video.currentTime >= d - LOOP_EPS) {
        video.currentTime = start
      }
      patchRuntime(deviceId, {
        currentTime: video.currentTime,
        duration: Number.isFinite(d) ? d : 0,
      })
    }

    const onPlay = () => patchRuntime(deviceId, { playing: true })
    const onPause = () => patchRuntime(deviceId, { playing: false })

    registerVideo(deviceId, video)
    video.addEventListener('loadedmetadata', syncMeta)
    video.addEventListener('durationchange', syncMeta)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) syncMeta()

    return () => {
      video.removeEventListener('loadedmetadata', syncMeta)
      video.removeEventListener('durationchange', syncMeta)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      unregisterVideo(deviceId)
    }
  }, [deviceId, video, registerVideo, unregisterVideo, patchRuntime])
}

/** Re-seek when loop start changes while video is mounted. */
export function useApplyVideoStartTime(deviceId: string, video: HTMLVideoElement | null, startTime: number) {
  useEffect(() => {
    if (!video) return
    const d = video.duration
    if (!Number.isFinite(d) || d <= 0) return
    if (video.currentTime < startTime - 0.01 || video.currentTime >= d - LOOP_EPS) {
      video.currentTime = Math.min(startTime, Math.max(0, d - 0.001))
    }
  }, [deviceId, video, startTime])
}
