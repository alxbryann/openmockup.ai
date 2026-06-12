import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer'
import { findGradientPreset } from './gradients'
import { syncLiveCameraFromPose, waitFrames, ensureEven } from './cameraSync'
import { evaluateCameraKeyframes, evaluateCameraMotion } from './cameraMotionPresets'
import { useStore } from './store'

export type VideoExportPreset = 'screen' | 1920 | 3840

/**
 * Background composition mode for the export:
 * - `solid`        → bake current scene background into the video (MP4 H.264)
 * - `green`        → bake a pure chroma-key green (#00FF00) background (MP4 H.264).
 *                    Easy to key out in any video editor (Premiere, DaVinci, FCP…).
 * - `transparent`  → keep alpha channel, export as WebM/VP9 with alpha.
 *                    Drops straight into After Effects, CapCut Pro, web pages…
 */
export type VideoExportBgMode = 'solid' | 'green' | 'transparent'

export type ExportProgress = {
  frame: number
  totalFrames: number
  ratio: number
}

type VFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
}

/** Pure chroma-key green used by every NLE on the market. */
export const CHROMA_KEY_GREEN = '#00FF00'

/**
 * Pick a target bitrate that produces visibly-clean output.
 *
 * The previous formula (`pixels × fps × 0.15`) was both too low at common
 * resolutions AND vulnerable to a low `effectiveFps` collapsing the bitrate
 * (e.g. 4 fps → ~1 Mbps at 1080p, which looks like a YouTube buffering
 * frame). We now use a higher bits-per-pixel factor and enforce a per-pixel
 * floor that is independent of fps so the output never drops into mush
 * territory even if the framerate detection ever gets it wrong again.
 */
function targetBitrateFor(width: number, height: number, fps: number): number {
  const pixels = width * height
  const computed = Math.round(pixels * fps * 0.18)
  // Resolution-only floor: ~10.4 Mbps @ 1080p, ~41 Mbps @ 4K.
  const floor = Math.round(pixels * 5.0)
  return Math.min(Math.max(computed, floor), 120_000_000)
}

/**
 * Seeks and waits for the new frame to actually be presented.
 * `seeked` fires when the seek operation completes but decoded pixels may not
 * yet be sampleable. `requestVideoFrameCallback` fires only when a real new
 * frame has been produced — that's what we need before reading the texture.
 */
export function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const v = video as VFCVideo
    const hasVFC = typeof v.requestVideoFrameCallback === 'function'
    let done = false
    const finalize = () => {
      if (done) return
      done = true
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }

    const onSeeked = () => {
      if (hasVFC) {
        v.requestVideoFrameCallback!(() => finalize())
        setTimeout(finalize, 120)
      } else {
        setTimeout(finalize, 40)
      }
    }

    if (Math.abs(video.currentTime - time) < 0.002) {
      if (hasVFC) {
        v.requestVideoFrameCallback!(() => finalize())
        setTimeout(finalize, 120)
      } else {
        setTimeout(finalize, 20)
      }
      return
    }

    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
    setTimeout(finalize, 1500)
  })
}

/** Pick H.264 level + profile strings to try, ordered most-to-least capable. */
function avcCodecCandidates(width: number, height: number, fps: number): string[] {
  const pixelsPerSec = width * height * fps
  const maxDim = Math.max(width, height)
  const candidates: string[] = []

  // High profile levels
  let levelHex = '34'
  if (pixelsPerSec <= 1920 * 1080 * 30) levelHex = '28'
  else if (pixelsPerSec <= 1920 * 1080 * 60) levelHex = '2A'
  else if (pixelsPerSec <= 3840 * 2160 * 30) levelHex = '33'
  candidates.push(`avc1.6400${levelHex}`)

  // Baseline / Main fallbacks — widely supported on macOS Safari and older GPUs
  if (maxDim <= 1920) candidates.push('avc1.420028', 'avc1.4D0028')
  if (maxDim <= 1280) candidates.push('avc1.42001F')

  return [...new Set(candidates)]
}

/** VP9 profile 0 baseline (8-bit 4:2:0). Used when exporting WebM with alpha. */
function vp9CodecString(): string {
  return 'vp09.00.10.08'
}

type EncoderRig =
  | {
      kind: 'mp4'
      encoder: VideoEncoder
      muxer: Mp4Muxer<Mp4ArrayBufferTarget>
      finalize: () => Blob
      fileExt: 'mp4'
      mime: 'video/mp4'
    }
  | {
      kind: 'webm-alpha'
      encoder: VideoEncoder
      muxer: WebmMuxer<WebmArrayBufferTarget>
      finalize: () => Blob
      fileExt: 'webm'
      mime: 'video/webm'
    }

async function buildEncoderForMp4(
  outW: number,
  outH: number,
  effectiveFps: number,
  bitrate: number,
): Promise<EncoderRig> {
  const codecs = avcCodecCandidates(outW, outH, effectiveFps)
  const accels = ['prefer-hardware', 'no-preference', 'prefer-software'] as const
  const avcFormats = [{ format: 'avc' as const }, { format: 'annexb' as const }]

  let chosenConfig: VideoEncoderConfig | null = null

  outer: for (const codec of codecs) {
    for (const accel of accels) {
      for (const avc of avcFormats) {
        const cfg: VideoEncoderConfig = {
          codec,
          width: outW,
          height: outH,
          bitrate,
          framerate: effectiveFps,
          bitrateMode: 'variable',
          latencyMode: 'quality',
          avc,
          hardwareAcceleration: accel,
        }
        const ok = await VideoEncoder.isConfigSupported(cfg)
          .then((r) => r.supported === true)
          .catch(() => false)
        if (ok) {
          chosenConfig = cfg
          break outer
        }
      }
    }
  }

  if (!chosenConfig) {
    throw new Error(
      `H.264 no disponible a ${outW}×${outH}. Elige resolución 1080p en Motion o usa Chrome/Edge.`,
    )
  }

  const muxer = new Mp4Muxer({
    target: new Mp4ArrayBufferTarget(),
    video: { codec: 'avc', width: outW, height: outH, frameRate: effectiveFps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e },
  })
  encoder.configure(chosenConfig)

  return {
    kind: 'mp4',
    encoder,
    muxer,
    fileExt: 'mp4',
    mime: 'video/mp4',
    finalize: () => {
      muxer.finalize()
      const { buffer } = muxer.target
      return new Blob([buffer], { type: 'video/mp4' })
    },
  }
}

async function buildEncoderForWebmAlpha(
  outW: number,
  outH: number,
  effectiveFps: number,
  bitrate: number,
): Promise<EncoderRig> {
  const codec = vp9CodecString()
  // VP9 alpha keeps a separate alpha plane. Force software for the widest
  // compatibility — most hardware VP9 paths don't keep alpha.
  const baseConfig: VideoEncoderConfig & { alpha?: 'keep' | 'discard' } = {
    codec,
    width: outW,
    height: outH,
    bitrate,
    framerate: effectiveFps,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    alpha: 'keep',
  }

  let chosenConfig: VideoEncoderConfig | null = null
  for (const accel of ['no-preference', 'prefer-software'] as const) {
    const cfg: VideoEncoderConfig = { ...baseConfig, hardwareAcceleration: accel }
    const ok = await VideoEncoder.isConfigSupported(cfg)
      .then((r) => r.supported === true)
      .catch(() => false)
    if (ok) {
      chosenConfig = cfg
      break
    }
  }
  if (!chosenConfig) {
    throw new Error(
      'Tu navegador no soporta video transparente (VP9 con alpha). Usa Chrome 94+ / Edge 94+, o prueba "Pantalla verde".',
    )
  }

  const muxer = new WebmMuxer({
    target: new WebmArrayBufferTarget(),
    video: { codec: 'V_VP9', width: outW, height: outH, frameRate: effectiveFps, alpha: true },
    firstTimestampBehavior: 'offset',
  })

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e },
  })
  encoder.configure(chosenConfig)

  return {
    kind: 'webm-alpha',
    encoder,
    muxer,
    fileExt: 'webm',
    mime: 'video/webm',
    finalize: () => {
      muxer.finalize()
      const { buffer } = muxer.target
      return new Blob([buffer], { type: 'video/webm' })
    },
  }
}

export async function exportVideoFrameByFrame(opts: {
  videoElement: HTMLVideoElement
  captureFrame: (w: number, h: number, opts?: { transparent?: boolean; bgCss?: string }) => HTMLCanvasElement
  bgCss: string
  bgMode?: VideoExportBgMode
  preset: VideoExportPreset
  canvasElement: HTMLCanvasElement
  fps?: number
  startTime: number
  endTime: number
  /** Explicit output size override (used by aspect-ratio presets). Wins over `preset`. */
  outputSize?: { w: number; h: number }
  onProgress: (p: ExportProgress) => void
  signal?: AbortSignal
}): Promise<void> {
  const {
    videoElement,
    captureFrame,
    bgCss,
    bgMode = 'solid',
    preset,
    canvasElement,
    fps = 30,
    startTime,
    endTime,
    outputSize,
    onProgress,
    signal,
  } = opts

  const clipDuration = endTime - startTime
  if (clipDuration <= 0) throw new Error('Rango inválido')

  // Honor the user's chosen framerate. We used to clamp this to the source
  // video's measured fps via `getVideoPlaybackQuality().totalVideoFrames`, but
  // that field only counts frames that were actually presented — if the user
  // hadn't fully played the source, the heuristic underestimated the fps
  // dramatically (4 fps was common) and the bitrate collapsed with it.
  const effectiveFps = Math.max(1, Math.round(fps))

  const totalFrames = Math.ceil(clipDuration * effectiveFps)
  if (totalFrames === 0) throw new Error('Sin frames para exportar')

  let outW: number, outH: number
  if (outputSize) {
    outW = outputSize.w
    outH = outputSize.h
  } else if (preset === 'screen') {
    outW = canvasElement.width
    outH = canvasElement.height
  } else {
    const aspect = canvasElement.clientWidth / canvasElement.clientHeight
    if (aspect >= 1) {
      outW = preset
      outH = Math.max(2, Math.round(preset / aspect))
    } else {
      outH = preset
      outW = Math.max(2, Math.round(preset * aspect))
    }
  }
  if (outW % 2 !== 0) outW -= 1
  if (outH % 2 !== 0) outH -= 1

  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'Tu navegador no soporta exportación de alta calidad (requiere Chrome 94+, Edge 94+, o Safari 16.4+).',
    )
  }

  const targetBitrate = targetBitrateFor(outW, outH, effectiveFps)

  const rig: EncoderRig = bgMode === 'transparent'
    ? await buildEncoderForWebmAlpha(outW, outH, effectiveFps, targetBitrate)
    : await buildEncoderForMp4(outW, outH, effectiveFps, targetBitrate)

  // Capture options per frame:
  // - transparent → no bg, keep alpha
  // - green       → flat #00FF00 chroma-key fill
  // - solid       → current scene bg
  const captureOpts: { transparent?: boolean; bgCss?: string } =
    bgMode === 'transparent'
      ? { transparent: true }
      : bgMode === 'green'
        ? { bgCss: CHROMA_KEY_GREEN }
        : { bgCss }

  const wasPlaying = !videoElement.paused
  videoElement.pause()

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('Exportación cancelada')

      const targetTime = Math.min(startTime + i / effectiveFps, endTime)
      await seekVideoTo(videoElement, targetTime)

      const frameCanvas = captureFrame(outW, outH, captureOpts)

      const timestamp = Math.round((i / effectiveFps) * 1_000_000)
      const frameDuration = Math.round((1 / effectiveFps) * 1_000_000)
      // Keyframe every ~2s for good seek + reasonable size
      const isKeyFrame = i % (effectiveFps * 2) === 0

      // VideoFrame.alpha defaults to 'discard' — we MUST tell it to keep
      // alpha so the VP9 encoder sees a separate alpha plane.
      const videoFrame = new VideoFrame(
        frameCanvas,
        rig.kind === 'webm-alpha'
          ? { timestamp, duration: frameDuration, alpha: 'keep' }
          : { timestamp, duration: frameDuration },
      )
      rig.encoder.encode(videoFrame, { keyFrame: isKeyFrame })
      videoFrame.close()

      onProgress({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames })
    }

    await rig.encoder.flush()
    rig.encoder.close()

    const blob = rig.finalize()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openmockup-${Date.now()}.${rig.fileExt}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } finally {
    if (wasPlaying) {
      videoElement.currentTime = startTime
      void videoElement.play().catch(() => {})
    }
  }
}

/** Export camera motion animation without a screen video source. */
export async function exportCameraMotionVideo(opts: {
  captureFrame: (w: number, h: number, opts?: { transparent?: boolean; bgCss?: string }) => HTMLCanvasElement
  bgCss: string
  bgMode?: VideoExportBgMode
  width: number
  height: number
  fps?: number
  durationSec: number
  cameraMotionPresetId?: string
  cameraKeyframes?: import('./cameraMotionPresets').CameraKeyframe[]
  onProgress?: (p: ExportProgress) => void
  signal?: AbortSignal
}): Promise<Blob> {
  const {
    captureFrame,
    bgCss,
    bgMode = 'solid',
    width,
    height,
    fps = 30,
    durationSec,
    onProgress,
    signal,
  } = opts

  const outW = ensureEven(width)
  const outH = ensureEven(height)
  const effectiveFps = Math.max(1, Math.round(fps))
  const totalFrames = Math.ceil(durationSec * effectiveFps)
  if (totalFrames === 0) throw new Error('No frames to export')

  const store = useStore.getState()
  store.setAutoRotate(false)

  const motionStart = {
    cameraPosition: [...store.cameraPosition] as [number, number, number],
    cameraTarget: [...store.cameraTarget] as [number, number, number],
    orbitDistance: store.orbitDistance,
    cameraRoll: store.cameraRoll,
  }

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('VideoEncoder not supported in this browser. Use Chrome or Edge.')
  }

  const ctx = (window as unknown as { __mockitCtx?: unknown }).__mockitCtx
  if (!ctx) {
    throw new Error('Scene not ready. Wait for the 3D canvas to load and try again.')
  }

  const targetBitrate = targetBitrateFor(outW, outH, effectiveFps)
  const rig: EncoderRig = bgMode === 'transparent'
    ? await buildEncoderForWebmAlpha(outW, outH, effectiveFps, targetBitrate)
    : await buildEncoderForMp4(outW, outH, effectiveFps, targetBitrate)

  // Only pass bgCss when it's a known gradient or solid hex — same rules as video export.
  const captureBgCss =
    bgMode === 'solid' && (findGradientPreset(bgCss) || bgCss.startsWith('#')) ? bgCss : undefined
  const captureOpts: { transparent?: boolean; bgCss?: string } =
    bgMode === 'transparent'
      ? { transparent: true }
      : bgMode === 'green'
        ? { bgCss: CHROMA_KEY_GREEN }
        : captureBgCss
          ? { bgCss: captureBgCss }
          : {}

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('Export cancelled')

      const t = totalFrames <= 1 ? 0 : i / (totalFrames - 1)
      const timeSec = t * durationSec

      let pose = motionStart
      if (opts.cameraKeyframes && opts.cameraKeyframes.length >= 2) {
        pose = evaluateCameraKeyframes(opts.cameraKeyframes, timeSec)
      } else if (opts.cameraMotionPresetId) {
        pose = evaluateCameraMotion(opts.cameraMotionPresetId, t, motionStart)
      }

      // Direct camera sync — React useFrame won't run mid-loop without a re-render.
      syncLiveCameraFromPose(pose)
      await waitFrames(2)

      const frameCanvas = captureFrame(outW, outH, captureOpts)
      const timestamp = Math.round((i / effectiveFps) * 1_000_000)
      const frameDuration = Math.round((1 / effectiveFps) * 1_000_000)
      const isKeyFrame = i % (effectiveFps * 2) === 0
      const videoFrame = new VideoFrame(
        frameCanvas,
        rig.kind === 'webm-alpha'
          ? { timestamp, duration: frameDuration, alpha: 'keep' }
          : { timestamp, duration: frameDuration },
      )
      rig.encoder.encode(videoFrame, { keyFrame: isKeyFrame })
      videoFrame.close()
      onProgress?.({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames })
    }

    await rig.encoder.flush()
    rig.encoder.close()
    return rig.finalize()
  } catch (e) {
    try {
      rig.encoder.close()
    } catch {
      /* ignore */
    }
    throw e
  }
}
