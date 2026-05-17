import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { invalidate, useThree } from '@react-three/fiber'

/**
 * `ShapeGeometry` in three@0.184 sets `uv` to raw vertex (x,y) — not [0,1]. Without this,
 * textures only sample a ~1×1 patch at the center (clamp) and look like a tiny thumbnail.
 */
function applyBoundingBoxUVs(geom: THREE.BufferGeometry, width: number, height: number) {
  const pos = geom.getAttribute('position')
  const uv = geom.getAttribute('uv')
  if (!pos || !uv) return
  const pa = pos.array as Float32Array
  const uva = uv.array as Float32Array
  const hw = width / 2
  const hh = height / 2
  for (let i = 0; i < pa.length; i += 3) {
    const vx = pa[i]
    const vy = pa[i + 1]
    const j = (i / 3) * 2
    uva[j] = (vx + hw) / width
    uva[j + 1] = (vy + hh) / height
  }
  uv.needsUpdate = true
}

/** Rotate sampling 180° on the quad (fixes upside-down / mirrored screenshots on some lid layouts). */
function flipUv180(geom: THREE.BufferGeometry) {
  const uv = geom.getAttribute('uv')
  if (!uv) return
  const uva = uv.array as Float32Array
  for (let i = 0; i < uva.length; i += 2) {
    uva[i] = 1 - uva[i]
    uva[i + 1] = 1 - uva[i + 1]
  }
  uv.needsUpdate = true
}

export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const ww = Math.max(1e-4, w)
  const hh = Math.max(1e-4, h)
  const maxR = Math.min(ww, hh) / 2 - 1e-4
  const rr = Math.min(Math.max(0, r), maxR)
  const s = new THREE.Shape()
  const x = -ww / 2,
    y = -hh / 2
  s.moveTo(x + rr, y)
  s.lineTo(x + ww - rr, y)
  s.quadraticCurveTo(x + ww, y, x + ww, y + rr)
  s.lineTo(x + ww, y + hh - rr)
  s.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh)
  s.lineTo(x + rr, y + hh)
  s.quadraticCurveTo(x, y + hh, x, y + hh - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  return s
}

export type ScreenshotPlaneProps = {
  screenshot: string | null
  /** Full opening width (matches bezel hole). */
  screenW: number
  screenH: number
  /** Inner corner radius of the opening (before inset). */
  openingCornerR: number
  /** Per-side inset of the lit mesh vs opening. */
  planeInset?: number
  /**
   * Minimum allowed corner radius after inset subtraction.
   * Defaults to 0.02 (scene units). Pass 0 when screenW/screenH are in geometry
   * units (e.g. MacBook GLTF overlay) so tiny proportional radii are respected.
   */
  minCornerR?: number
  /** Z offset from parent (lid local space: +Z is toward viewer when lid faces +Z). */
  z?: number
  /** When true, UVs are flipped so the texture reads upright on laptop lids that use the opposite winding. */
  flipTexture180?: boolean
  /** Called with an error message when the image fails to load, or null when it succeeds. */
  onLoadError?: (msg: string | null) => void
}

/** R3F can reset `map` on reconciler passes; keep one THREE material and assign `map` imperatively. */
export function ScreenshotPlane({
  screenshot,
  screenW,
  screenH,
  openingCornerR,
  planeInset = 0.08,
  minCornerR = 0.02,
  z = 0,
  flipTexture180 = false,
  onLoadError,
}: ScreenshotPlaneProps) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x050505),
        toneMapped: false,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    [],
  )
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    /* eslint-disable react-hooks/immutability */
    if (!screenshot) {
      mat.map?.dispose()
      mat.map = null
      mat.color.set(0x050505)
      mat.needsUpdate = true
      return
    }

    let cancelled = false
    queueMicrotask(() => onLoadError?.(null))

    const loader = new THREE.TextureLoader()
    loader.load(
      screenshot,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
        tex.needsUpdate = true
        mat.map?.dispose()
        mat.map = tex
        mat.color.set(0xffffff)
        mat.needsUpdate = true
        invalidate()
        onLoadError?.(null)
      },
      undefined,
      () => {
        if (cancelled) return
        mat.map?.dispose()
        mat.map = null
        mat.color.set(0x050505)
        mat.needsUpdate = true
        onLoadError?.(
          'No se pudo mostrar la imagen en 3D. Prueba JPEG o PNG, o exporta la captura sin HEIC.',
        )
      },
    )

    return () => {
      cancelled = true
      mat.map?.dispose()
      mat.map = null
      mat.color.set(0x050505)
      mat.needsUpdate = true
    }
    /* eslint-enable react-hooks/immutability */
  }, [screenshot, gl, mat, onLoadError])

  useEffect(
    () => () => {
      mat.map?.dispose()
      mat.dispose()
    },
    [mat],
  )

  const pw = Math.max(0.02, screenW - planeInset * 2)
  const ph = Math.max(0.02, screenH - planeInset * 2)
  const cornerR = Math.min(
    Math.max(minCornerR, openingCornerR - planeInset),
    Math.min(pw, ph) * 0.48,
  )

  const screenGeom = useMemo(() => {
    const shape = roundedRectShape(pw, ph, cornerR)
    const g = new THREE.ShapeGeometry(shape, 64)
    applyBoundingBoxUVs(g, pw, ph)
    if (flipTexture180) flipUv180(g)
    return g
  }, [pw, ph, cornerR, flipTexture180])

  useEffect(
    () => () => {
      screenGeom.dispose()
    },
    [screenGeom],
  )

  return (
    <mesh position={[0, 0, z]} geometry={screenGeom}>
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

export function roundedHolePath(w: number, h: number, r: number): THREE.Path {
  const path = new THREE.Path()
  const x = -w / 2,
    y = -h / 2
  path.moveTo(x + r, y)
  path.quadraticCurveTo(x, y, x, y + r)
  path.lineTo(x, y + h - r)
  path.quadraticCurveTo(x, y + h, x + r, y + h)
  path.lineTo(x + w - r, y + h)
  path.quadraticCurveTo(x + w, y + h, x + w, y + h - r)
  path.lineTo(x + w, y + r)
  path.quadraticCurveTo(x + w, y, x + w - r, y)
  path.lineTo(x + r, y)
  return path
}
