import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_URL = '/models/iphone17pro.glb'

/**
 * Screen mesh uses this material name in the GLB.
 * We replace it with a MeshBasicMaterial so it looks like a self-illuminated OLED display.
 */
const SCREEN_MAT = 'Screen_BG'

/**
 * The Screen_BG mesh UV in the GLB only covers a sub-region of the full texture atlas:
 *   U: [0.18489, 0.52402]  V: [0.43886, 0.60132]
 * We compensate by setting texture.repeat/offset so our full canvas maps into that window.
 *
 * Additionally the UV has a 90° CCW rotation + horizontal mirror baked in.
 * Pre-processing inverse: flip X first, then rotate 90° CW.
 */
const SCREEN_UV_MIN_U = 0.18488599359989166
const SCREEN_UV_MAX_U = 0.5240240097045898
const SCREEN_UV_MIN_V = 0.43885600566864014
const SCREEN_UV_MAX_V = 0.6013180017471313

function buildScreenTexture(screenshot: string): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const sw = img.naturalWidth
      const sh = img.naturalHeight

      // Step 1: flip horizontally (sw × sh → sw × sh)
      const tmp = document.createElement('canvas')
      tmp.width = sw
      tmp.height = sh
      const ctxTmp = tmp.getContext('2d')!
      ctxTmp.translate(sw, 0)
      ctxTmp.scale(-1, 1)
      ctxTmp.drawImage(img, 0, 0)

      // Step 2: rotate 90° CW (sw × sh → sh × sw)
      const out = document.createElement('canvas')
      out.width = sh
      out.height = sw
      const ctx = out.getContext('2d')!
      ctx.translate(sh, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(tmp, 0, 0)

      const tex = new THREE.CanvasTexture(out)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false

      // Map our full [0,1]×[0,1] canvas into the UV sub-region the screen mesh uses
      const rangeU = SCREEN_UV_MAX_U - SCREEN_UV_MIN_U
      const rangeV = SCREEN_UV_MAX_V - SCREEN_UV_MIN_V
      tex.repeat.set(1 / rangeU, 1 / rangeV)
      tex.offset.set(-SCREEN_UV_MIN_U / rangeU, -SCREEN_UV_MIN_V / rangeV)
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping

      resolve(tex)
    }
    img.onerror = reject
    img.src = screenshot
  })
}

/**
 * Body/frame meshes that respond to the device-color swatch.
 * Material.002 = main titanium body; Material.004 = camera cylinder accents.
 * Rim_Buttons = side frame + volume/power buttons (has a baked baseColorTexture
 *   which is cleared on load so the device color tints correctly).
 */
const BODY_MATS = new Set(['Material.002', 'Material.004', 'Rim_Buttons'])

/** Match the procedural phone height in scene units so the GLTF fits the same camera/shadow rig. */
const TARGET_H = 14.66

export function PhoneFromGltf({ screenshot, deviceColor }: { screenshot: string | null; deviceColor: string }) {
  const { scene } = useGLTF(MODEL_URL)
  const wrapperRef = useRef<THREE.Group>(null)

  /**
   * Deep-clone the cached GLTF scene and clone every material so mutations
   * here don't affect the shared cache (important for hot-reload / multiple instances).
   */
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

  /**
   * Auto-scale + center the model so it matches TARGET_H scene units.
   * Runs once per clone (i.e. once after mount since the GLTF is cached).
   */
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

    // Recenter after scaling
    const box2 = new THREE.Box3().setFromObject(wrapper)
    const center = box2.getCenter(new THREE.Vector3())
    wrapper.position.set(-center.x, -center.y, -center.z)
  }, [root])

  /** Tint the titanium body with the user's chosen device color. */
  useEffect(() => {
    const c = new THREE.Color(deviceColor)
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat && BODY_MATS.has(mat.name)) {
        mat.color.copy(c)
        // Rim_Buttons bakes its teal color into the albedo texture; clear it so
        // the device color shows cleanly (normal/roughness maps are kept).
        if (mat.map) {
          mat.map = null
          mat.needsUpdate = true
        }
      }
    })
  }, [root, deviceColor])

  /**
   * Replace Screen_BG with a MeshBasicMaterial that shows the screenshot.
   * MeshBasicMaterial is intentional — real OLED screens emit their own light
   * and should not receive scene lighting, which gives the most accurate look.
   *
   * UV note: GLTFLoader stores mesh UVs pre-flipped (V = 1−V_gltf) so textures
   * must have flipY = false to appear right-side-up on GLTF meshes.
   */
  useEffect(() => {
    let activeTex: THREE.Texture | null = null

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat?.name !== SCREEN_MAT) return

      // Dispose any previously created custom material to free GPU memory
      const prev = mesh.material as THREE.Material & { _mockitCustom?: boolean }
      if (prev._mockitCustom) prev.dispose()

      if (!screenshot) {
        const off = new THREE.MeshBasicMaterial({ color: '#000000' })
        off.name = SCREEN_MAT
        ;(off as any)._mockitCustom = true
        mesh.material = off
        return
      }

      const screenMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
      screenMat.name = SCREEN_MAT
      ;(screenMat as any)._mockitCustom = true
      mesh.material = screenMat

      let cancelled = false
      buildScreenTexture(screenshot).then((tex) => {
        if (cancelled) { tex.dispose(); return }
        screenMat.map = tex
        screenMat.needsUpdate = true
        activeTex = tex
      }).catch(console.error)

      return () => { cancelled = true }
    })

    return () => {
      activeTex?.dispose()
    }
  }, [root, screenshot])

  return (
    <group ref={wrapperRef}>
      <primitive object={root} />
    </group>
  )
}

useGLTF.preload(MODEL_URL)
