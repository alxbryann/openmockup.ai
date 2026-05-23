import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ScreenMediaKind } from './store'
import {
  applyPhoneGltfScreenUv,
  buildPhoneGltfTextureFromImage,
  createScreenVideoElement,
  disposeScreenVideo,
  drawPhoneGltfScreenFrame,
  waitForVideoReady,
} from './screenMedia'
import { useApplyVideoStartTime, useDeviceScreenVideo } from './useDeviceScreenVideo'

const MODEL_URL = '/models/iphone17pro.glb'

/**
 * Screen mesh uses this material name in the GLB.
 * We replace it with a MeshBasicMaterial so it looks like a self-illuminated OLED display.
 */
const SCREEN_MAT = 'Screen_BG'

/**
 * Body/frame meshes that respond to the device-color swatch.
 * Material.002 = main titanium body; Material.004 = camera cylinder accents.
 * Rim_Buttons = side frame + volume/power buttons (has a baked baseColorTexture
 *   which is cleared on load so the device color tints correctly).
 */
const BODY_MATS = new Set(['Material.002', 'Material.004', 'Rim_Buttons'])

/** Match the procedural phone height in scene units so the GLTF fits the same camera/shadow rig. */
const TARGET_H = 14.66

export function PhoneFromGltf({
  deviceId,
  screenshot,
  screenMediaKind = null,
  deviceColor,
}: {
  deviceId: string
  screenshot: string | null
  screenMediaKind?: ScreenMediaKind | null
  deviceColor: string
}) {
  const { scene } = useGLTF(MODEL_URL)
  const wrapperRef = useRef<THREE.Group>(null)
  const screenMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const [screenVideo, setScreenVideo] = useState<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const kind = screenshot ? (screenMediaKind ?? 'image') : null
  const videoStartTime = useStore(
    (s) => s.devices.find((d) => d.id === deviceId)?.videoStartTime ?? 0,
  )

  useDeviceScreenVideo(deviceId, kind === 'video' ? screenVideo : null)
  useApplyVideoStartTime(deviceId, kind === 'video' ? screenVideo : null, videoStartTime)

  const root = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m: THREE.Material) => m.clone())
      } else if (mesh.material) {
        mesh.material = (mesh.material as THREE.Material).clone()
      }
    })
    return clone
  }, [scene])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    wrapper.scale.set(1, 1, 1)
    wrapper.position.set(0, 0, 0)

    const box = new THREE.Box3().setFromObject(wrapper)
    const h = box.max.y - box.min.y
    if (h < 0.001) return

    const s = TARGET_H / h
    wrapper.scale.setScalar(s)

    const box2 = new THREE.Box3().setFromObject(wrapper)
    const center = box2.getCenter(new THREE.Vector3())
    wrapper.position.set(-center.x, -center.y, -center.z)
  }, [root])

  useEffect(() => {
    const c = new THREE.Color(deviceColor)
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat && BODY_MATS.has(mat.name)) {
        mat.color.copy(c)
        if (mat.map) {
          mat.map = null
          mat.needsUpdate = true
        }
      }
    })
  }, [root, deviceColor])

  useEffect(() => {
    let activeTex: THREE.Texture | null = null
    let cancelled = false

    const disposeVideo = () => {
      disposeScreenVideo(screenVideoRef.current)
      screenVideoRef.current = null
      setScreenVideo(null)
      videoCanvasRef.current = null
    }

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat?.name !== SCREEN_MAT) return

      const prev = mesh.material as THREE.Material & { _mockitCustom?: boolean }
      if (prev._mockitCustom) prev.dispose()

      disposeVideo()
      screenMatRef.current = null
      activeTex?.dispose()
      activeTex = null

      if (!screenshot) {
        const off = new THREE.MeshBasicMaterial({ color: '#000000' })
        off.name = SCREEN_MAT
        ;(off as THREE.Material & { _mockitCustom?: boolean })._mockitCustom = true
        mesh.material = off
        return
      }

      const screenMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
      screenMat.name = SCREEN_MAT
      ;(screenMat as THREE.Material & { _mockitCustom?: boolean })._mockitCustom = true
      mesh.material = screenMat
      screenMatRef.current = screenMat

      if (kind === 'video') {
        const video = createScreenVideoElement(screenshot)
        screenVideoRef.current = video
        setScreenVideo(video)
        waitForVideoReady(video)
          .then(async () => {
            if (cancelled) return
            const start = useStore.getState().devices.find((d) => d.id === deviceId)?.videoStartTime ?? 0
            if (Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = Math.min(start, Math.max(0, video.duration - 0.001))
            }
            await video.play().catch(() => {})
            if (cancelled) return
            const vw = video.videoWidth
            const vh = video.videoHeight
            if (!vw || !vh) throw new Error('no dimensions')
            const canvas = drawPhoneGltfScreenFrame(video, vw, vh)
            videoCanvasRef.current = canvas
            const tex = new THREE.CanvasTexture(canvas)
            tex.colorSpace = THREE.SRGBColorSpace
            tex.flipY = false
            applyPhoneGltfScreenUv(tex)
            screenMat.map = tex
            screenMat.needsUpdate = true
            activeTex = tex
          })
          .catch(console.error)
        return
      }

      buildPhoneGltfTextureFromImage(screenshot)
        .then((tex) => {
          if (cancelled) {
            tex.dispose()
            return
          }
          screenMat.map = tex
          screenMat.needsUpdate = true
          activeTex = tex
        })
        .catch(console.error)
    })

    return () => {
      cancelled = true
      activeTex?.dispose()
      disposeVideo()
      screenMatRef.current = null
    }
  }, [root, screenshot, kind, deviceId])

  useFrame(() => {
    const video = screenVideo
    const canvas = videoCanvasRef.current
    const screenMat = screenMatRef.current
    if (kind !== 'video' || !video || !canvas || !screenMat?.map) return
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return
    drawPhoneGltfScreenFrame(video, vw, vh, canvas)
    screenMat.map.needsUpdate = true
  })

  return (
    <group ref={wrapperRef}>
      <primitive object={root} />
    </group>
  )
}

useGLTF.preload(MODEL_URL)
