import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import {
  frameColorSaturation,
  frameMaterialLuminance,
  getDeviceFrameSurfaceMaps,
} from './deviceFrameTextures'
import {
  roundedHolePath,
  roundedRectShape,
  ScreenshotPlane,
} from './ScreenshotPlane'

type FramePhysicalProps = {
  color: string
  metalness: number
  roughness: number
  roughnessMap: THREE.Texture
  normalMap: THREE.Texture
  normalScale: THREE.Vector2
  anisotropy: number
  anisotropyRotation: number
  clearcoat: number
  clearcoatRoughness: number
  envMapIntensity: number
}

function useFramePhysicalMaterial(deviceColor: string): FramePhysicalProps {
  const normalDark = useMemo(() => new THREE.Vector2(0.48, 0.48), [])
  /** Micro‑relieve visible en aluminio cepillado (el valor bajo anterior dejaba el marco “plástico”). */
  const normalBrushed = useMemo(() => new THREE.Vector2(0.4, 0.4), [])

  return useMemo(() => {
    const lum = frameMaterialLuminance(deviceColor)
    const sat = frameColorSaturation(deviceColor)
    const isDark = lum < 0.3
    const maps = getDeviceFrameSurfaceMaps(isDark ? 'titanium' : 'aluminum')

    // Anisotropy off: with ExtrudeGeometry/RoundedBox, missing/degenerate tangents + anisotropic
    // clearcoat BRDF can produce solid black vertical bands on some GPUs (driver/shader edge cases).
    if (isDark) {
      return {
        color: deviceColor,
        metalness: 0.94,
        roughness: 0.5,
        roughnessMap: maps.roughnessMap,
        normalMap: maps.normalMap,
        normalScale: normalDark,
        anisotropy: 0,
        anisotropyRotation: 0,
        clearcoat: 0.04,
        clearcoatRoughness: 0.88,
        envMapIntensity: 1.12,
      }
    }

    // Natural / plateado / colores: marco de aluminio anodizado (no pintura dieléctrica).
    const starlightLike = lum > 0.58 && sat < 0.12
    const metalness = starlightLike ? 0.93 : 0.89
    const roughness = Math.min(0.52, starlightLike ? 0.38 : 0.44 + (1 - lum) * 0.05)
    const envMapIntensity = starlightLike ? 1.36 : 1.18

    return {
      color: deviceColor,
      metalness,
      roughness,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: normalBrushed,
      anisotropy: 0,
      anisotropyRotation: 0,
      clearcoat: 0.042,
      clearcoatRoughness: 0.76,
      envMapIntensity,
    }
  }, [deviceColor, normalDark, normalBrushed])
}

const W = 7.06
const H = 14.66
const D = 0.78
const CORNER = 1.0
// Screen visible area (texture plane matches bezel hole rounding)
const SCREEN_W = 6.3
const SCREEN_H = 13.5
/** Inner opening of the bezel mask — must match `ScreenshotPlane` rounding. */
const SCREEN_OPENING_CORNER_R = 0.35

/** Front cap of RoundedBox (ExtrudeGeometry + bevel) sits near z = D/2; keep layers separated or depth buffer flickers (checkerboard). */
const BODY_FRONT_Z = D / 2
/** Rounded platform top sits slightly below the texture; bezel stays in front. */
const SCREEN_Z = BODY_FRONT_Z + 0.024
const SCREEN_PLATFORM_DEPTH = 0.07
const SCREEN_PLATFORM_CENTER_Z = SCREEN_Z - 0.01 - SCREEN_PLATFORM_DEPTH / 2
const BEZEL_Z = BODY_FRONT_Z + 0.03

/** Rounded “glass” slab under the screenshot so corners read as physical display stack, not a square bitmap on flat metal. */
function ScreenPlatform() {
  const radius = 0.42
  return (
    <RoundedBox
      args={[SCREEN_W - 0.02, SCREEN_H - 0.02, SCREEN_PLATFORM_DEPTH]}
      radius={radius}
      smoothness={5}
      position={[0, 0, SCREEN_PLATFORM_CENTER_Z]}
    >
      <meshPhysicalMaterial
        color="#050608"
        metalness={0.12}
        roughness={0.35}
        clearcoat={0.65}
        clearcoatRoughness={0.22}
        envMapIntensity={0.95}
      />
    </RoundedBox>
  )
}

/**
 * Camera lens — points outward from the back of the phone (-Z world direction).
 * The lens group itself isn't rotated; each cylinder is rotated [PI/2, 0, 0]
 * so its axis aligns with world +Z. "Outside" of the lens is at more negative z.
 */
function CameraLens({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Outer black housing (the well that holds the lens) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.56, 0.56, 0.22, 64]} />
        <meshPhysicalMaterial
          color="#0a0b0e"
          metalness={0.78}
          roughness={0.45}
          clearcoat={0.4}
          clearcoatRoughness={0.35}
          envMapIntensity={1.1}
        />
      </mesh>
      {/* Brushed metallic rim around the lens opening */}
      <mesh position={[0, 0, -0.115]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.50, 0.50, 0.025, 64]} />
        <meshPhysicalMaterial
          color="#8a8d92"
          metalness={0.96}
          roughness={0.22}
          envMapIntensity={1.5}
        />
      </mesh>
      {/* Lens glass — single opaque glossy disc (looks like sealed lens optics) */}
      <mesh position={[0, 0, -0.131]}>
        <circleGeometry args={[0.44, 64]} />
        <meshPhysicalMaterial
          color="#03050c"
          metalness={0.62}
          roughness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.03}
          envMapIntensity={1.8}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Subtle inner pupil dot for depth */}
      <mesh position={[0, 0, -0.132]}>
        <circleGeometry args={[0.085, 32]} />
        <meshBasicMaterial color="#000" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Compact square camera bump — top-left corner, iPhone 16 Pro layout. */
const CAM_BUMP_W = 3.05
const CAM_BUMP_H = 3.05
/** Group origin at bump center; bump placed in top-left area of the back. */
const CAM_BUMP_CX = -W / 2 + 1.98
const CAM_BUMP_CY = H / 2 - 2.36
const CAM_BUMP_Z = -D / 2

function CameraModule({
  frameMat,
  deviceColor,
}: {
  frameMat: FramePhysicalProps
  deviceColor: string
}) {
  const hw = CAM_BUMP_W / 2
  const hh = CAM_BUMP_H / 2

  return (
    <group position={[CAM_BUMP_CX, CAM_BUMP_CY, CAM_BUMP_Z]}>
      {/* Frosted glass plateau in device color */}
      <RoundedBox
        args={[CAM_BUMP_W - 0.06, CAM_BUMP_H - 0.06, 0.33]}
        radius={0.54}
        smoothness={6}
        position={[0, 0, -0.165]}
        castShadow
      >
        <meshPhysicalMaterial
          color={deviceColor}
          metalness={0.16}
          roughness={0.52}
          clearcoat={0.48}
          clearcoatRoughness={0.32}
          envMapIntensity={1.05}
        />
      </RoundedBox>
      {/* Metal rim ring around the bump */}
      <RoundedBox
        args={[CAM_BUMP_W, CAM_BUMP_H, 0.055]}
        radius={0.56}
        smoothness={6}
        position={[0, 0, -0.025]}
      >
        <meshPhysicalMaterial
          {...frameMat}
          roughness={frameMat.roughness * 0.82}
          clearcoat={frameMat.clearcoat * 1.15}
        />
      </RoundedBox>

      {/* Triangular lens layout: two stacked on left, one on right */}
      <CameraLens position={[-hw + 0.82, hh - 0.80, -0.34]} />
      <CameraLens position={[-hw + 0.82, -hh + 0.82, -0.34]} />
      <CameraLens position={[hw - 0.88, 0.02, -0.34]} />

      {/* Flash — top-right */}
      <group position={[hw - 0.40, hh - 0.40, -0.32]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.055, 32]} />
          <meshPhysicalMaterial color="#1b1c1f" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.033]}>
          <circleGeometry args={[0.13, 32]} />
          <meshPhysicalMaterial
            color="#fff5e0"
            emissive="#fff0d8"
            emissiveIntensity={0.08}
            metalness={0.2}
            roughness={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* LiDAR — bottom-right */}
      <group position={[hw - 0.52, -hh + 0.50, -0.32]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.048, 32]} />
          <meshPhysicalMaterial color="#16171a" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, -0.028]}>
          <circleGeometry args={[0.10, 32]} />
          <meshPhysicalMaterial
            color="#0a0a0c"
            metalness={0.3}
            roughness={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  )
}

function BackPanel({ deviceColor }: { deviceColor: string }) {
  const { frostHex, darkHex } = useMemo(() => {
    const c = new THREE.Color(deviceColor)
    const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
    const frost = c.clone().lerp(new THREE.Color('#f4f4f5'), lum < 0.28 ? 0.16 : 0.08)
    const dark = c.clone().multiplyScalar(lum > 0.52 ? 0.46 : lum > 0.38 ? 0.52 : 0.64)
    return { frostHex: `#${frost.getHexString()}`, darkHex: `#${dark.getHexString()}` }
  }, [deviceColor])

  const fullShape = useMemo(() => roundedRectShape(W - 0.04, H - 0.04, CORNER - 0.02), [])
  const marginY = 0.16
  const darkTop = H / 2 - 2.94
  const darkBottom = -H / 2 + marginY
  const darkH = darkTop - darkBottom
  const darkW = W - 0.2
  const darkCy = (darkTop + darkBottom) / 2
  const darkShape = useMemo(
    () => roundedRectShape(darkW, darkH, Math.max(0.28, CORNER - 0.12)),
    [darkH, darkW],
  )

  const glass = {
    metalness: 0.14,
    roughness: 0.54,
    clearcoat: 0.44,
    clearcoatRoughness: 0.34,
    envMapIntensity: 1.02,
  }

  return (
    <group>
      <mesh position={[0, 0, -D / 2 - 0.013]} rotation={[0, Math.PI, 0]}>
        <shapeGeometry args={[fullShape, 64]} />
        <meshPhysicalMaterial
          color={frostHex}
          {...glass}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh position={[0, darkCy, -D / 2 - 0.007]} rotation={[0, Math.PI, 0]}>
        <shapeGeometry args={[darkShape, 64]} />
        <meshPhysicalMaterial
          color={darkHex}
          {...glass}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  )
}

/** Pastillas del lateral: cápsula (semiesferas en Y); escala X horneada en la geometría para normales correctas. */
function SideButton({
  frameMat,
  side,
  y,
  length,
  variant,
}: {
  frameMat: FramePhysicalProps
  side: 'left' | 'right'
  y: number
  length: number
  variant: 'compact' | 'long'
}) {
  const depthZ = D * 0.56
  const thickX = variant === 'compact' ? 0.07 : 0.076
  // Radio de los tapones: limitado por el grosor en Z y por dejar un tramo cilíndrico mínimo (extremos bien redondos).
  const capR = Math.min(depthZ * 0.5 - 0.006, (length - 0.03) / 2)
  const cylLen = Math.max(0.03, length - 2 * capR)
  const scaleX = thickX / (2 * capR)

  const geometry = useMemo(() => {
    const g = new THREE.CapsuleGeometry(capR, cylLen, 10, 24)
    g.scale(scaleX, 1, 1)
    g.computeVertexNormals()
    return g
  }, [capR, cylLen, scaleX])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  // Alinear la cara exterior del botón con la cara del RoundedBox (x = ±W/2 en la zona plana).
  // Antes: -W/2 - inset - thickX/2 colgaba todo el volumen fuera → doble bloque / costura lateral.
  const x = side === 'left' ? -W / 2 + thickX / 2 : W / 2 - thickX / 2

  return (
    <mesh position={[x, y, 0]} geometry={geometry} castShadow>
      <meshPhysicalMaterial
        {...frameMat}
        roughness={Math.min(0.92, frameMat.roughness * 1.08)}
        clearcoat={frameMat.clearcoat * 0.65}
        clearcoatRoughness={Math.min(0.95, frameMat.clearcoatRoughness * 1.15)}
        envMapIntensity={frameMat.envMapIntensity * 0.92}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  )
}

/** iPhone 16 Pro: pastilla capacitiva ligeramente hundida respecto al power. */
function RecessedCameraControl({ frameMat }: { frameMat: FramePhysicalProps }) {
  const thick = 0.048
  const x = W / 2 - thick / 2 + 0.001
  const y = H / 2 - 5.42
  return (
    <RoundedBox
      args={[thick, 0.69, D * 0.4]}
      radius={0.08}
      smoothness={4}
      position={[x, y, 0.022]}
      castShadow
    >
      <meshPhysicalMaterial
        {...frameMat}
        roughness={Math.min(0.96, frameMat.roughness * 1.38)}
        clearcoat={frameMat.clearcoat * 0.32}
        envMapIntensity={frameMat.envMapIntensity * 0.76}
        polygonOffset
        polygonOffsetFactor={2}
        polygonOffsetUnits={2}
      />
    </RoundedBox>
  )
}

/** Líneas de antena horizontales en los cantos (vista lateral). */
function AntennaBands() {
  const ys = [H / 2 - 0.42, -H / 2 + 0.42]
  return (
    <group>
      {ys.flatMap((y) =>
        (['left', 'right'] as const).map((side) => (
          <mesh
            key={`${side}-${y}`}
            position={[side === 'left' ? -W / 2 + 0.038 : W / 2 - 0.038, y, 0]}
            castShadow
          >
            <boxGeometry args={[0.072, 0.034, D * 0.9]} />
            <meshPhysicalMaterial
              color="#5f636b"
              metalness={0.62}
              roughness={0.48}
              clearcoat={0.12}
              clearcoatRoughness={0.75}
              envMapIntensity={0.48}
            />
          </mesh>
        )),
      )}
    </group>
  )
}

function BottomDetails() {
  // USB-C cutout — pill shape
  const usbcShape = useMemo(() => {
    const s = new THREE.Shape()
    const w = 0.85,
      h = 0.32,
      r = h / 2
    s.moveTo(-w / 2 + r, -h / 2)
    s.lineTo(w / 2 - r, -h / 2)
    s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false)
    s.lineTo(-w / 2 + r, h / 2)
    s.absarc(-w / 2 + r, 0, r, Math.PI / 2, -Math.PI / 2, false)
    return s
  }, [])

  const yBottom = -H / 2 - 0.0015
  const speakerOffsets = useMemo(() => [0, 1, 2, 3, 4, 5].map((i) => 1.2 + i * 0.16), [])

  const portMat = (
    <meshPhysicalMaterial
      color="#040406"
      metalness={0.2}
      roughness={0.6}
      clearcoat={0.4}
      clearcoatRoughness={0.4}
      side={THREE.DoubleSide}
    />
  )

  return (
    <group>
      {/* USB-C centered */}
      <mesh position={[0, yBottom, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[usbcShape, 32]} />
        {portMat}
      </mesh>
      {/* Inner USB-C connector hint */}
      <mesh position={[0, yBottom - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.62, 0.13]} />
        <meshBasicMaterial color="#16181c" side={THREE.DoubleSide} />
      </mesh>

      {/* Microphones flanking USB-C */}
      {[-0.52, 0.52].map((mx) => (
        <mesh key={`mic-${mx}`} position={[mx, yBottom, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.038, 20]} />
          <meshBasicMaterial color="#0a0a0c" side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Speaker grille right (along X, at z=0 — flush with body) */}
      {speakerOffsets.map((x) => (
        <mesh key={`r-${x}`} position={[x, yBottom, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 24]} />
          <meshBasicMaterial color="#000" side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Speaker grille left (mirrored) */}
      {speakerOffsets.map((x) => (
        <mesh key={`l-${x}`} position={[-x, yBottom, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 24]} />
          <meshBasicMaterial color="#000" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

export function PhoneProcedural({ screenshot, deviceColor }: { screenshot: string | null; deviceColor: string }) {
  const frameMat = useFramePhysicalMaterial(deviceColor)

  // Bezel: outer rounded shape with inner hole (screen cutout)
  // This sits IN FRONT of the screen plane and masks the corners
  const bezelGeom = useMemo(() => {
    const outer = roundedRectShape(W - 0.12, H - 0.12, CORNER - 0.05)
    const hole = roundedHolePath(SCREEN_W, SCREEN_H, SCREEN_OPENING_CORNER_R)
    outer.holes.push(hole)
    return new THREE.ShapeGeometry(outer, 48)
  }, [])

  return (
    <group>
      {/* Metal frame body */}
      <RoundedBox
        args={[W, H, D]}
        radius={CORNER}
        smoothness={8}
        bevelSegments={4}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial {...frameMat} />
      </RoundedBox>

      {/* Back panel — matte glass in device color */}
      <BackPanel deviceColor={deviceColor} />

      {/* Rounded display stack under the texture (screenshots already include status bar / island). */}
      <ScreenPlatform />

      {/* Screen image (just above body front, behind bezel) */}
      <ScreenshotPlane
        screenshot={screenshot}
        screenW={SCREEN_W}
        screenH={SCREEN_H}
        openingCornerR={SCREEN_OPENING_CORNER_R}
        z={SCREEN_Z}
      />

      {/* Bezel ring with hole — matte black so it doesn't mirror the screen */}
      <mesh position={[0, 0, BEZEL_Z]} geometry={bezelGeom}>
        <meshBasicMaterial color="#000" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <CameraModule frameMat={frameMat} deviceColor={deviceColor} />

      <AntennaBands />

      {/* Izquierda: Action corta + volumen ± */}
      <SideButton
        frameMat={frameMat}
        side="left"
        variant="compact"
        y={H / 2 - 1.9}
        length={0.38}
      />
      <SideButton
        frameMat={frameMat}
        side="left"
        variant="long"
        y={H / 2 - 3.34}
        length={1.06}
      />
      <SideButton
        frameMat={frameMat}
        side="left"
        variant="long"
        y={H / 2 - 4.78}
        length={1.06}
      />
      <SideButton
        frameMat={frameMat}
        side="right"
        variant="long"
        y={H / 2 - 2.92}
        length={1.48}
      />
      <RecessedCameraControl frameMat={frameMat} />

      <BottomDetails />
    </group>
  )
}
