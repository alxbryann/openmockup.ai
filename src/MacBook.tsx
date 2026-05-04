import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { useStore } from './store'
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
  const normalBrushed = useMemo(() => new THREE.Vector2(0.4, 0.4), [])

  return useMemo(() => {
    const lum = frameMaterialLuminance(deviceColor)
    const sat = frameColorSaturation(deviceColor)
    const isDark = lum < 0.3
    const maps = getDeviceFrameSurfaceMaps(isDark ? 'titanium' : 'aluminum')

    if (isDark) {
      return {
        color: deviceColor,
        metalness: 0.94,
        roughness: 0.46,
        roughnessMap: maps.roughnessMap,
        normalMap: maps.normalMap,
        normalScale: normalDark,
        anisotropy: 0,
        anisotropyRotation: 0,
        clearcoat: 0.085,
        clearcoatRoughness: 0.72,
        envMapIntensity: 1.22,
      }
    }

    const starlightLike = lum > 0.58 && sat < 0.12
    const metalness = starlightLike ? 0.94 : 0.91
    const roughness = Math.min(0.46, starlightLike ? 0.3 : 0.37 + (1 - lum) * 0.04)
    const envMapIntensity = starlightLike ? 1.55 : 1.3

    return {
      color: deviceColor,
      metalness,
      roughness,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: normalBrushed,
      anisotropy: 0,
      anisotropyRotation: 0,
      clearcoat: 0.088,
      clearcoatRoughness: 0.62,
      envMapIntensity,
    }
  }, [deviceColor, normalDark, normalBrushed])
}

const LID_W = 16.35
const LID_H = 10.35
/** Tapa muy fina, como laptops Apple recientes */
const LID_THICK = 0.18
/** Cristal grande, marcos finos tipo Liquid Retina */
const SCREEN_W = 15.75
const SCREEN_H = 9.98
const SCREEN_OPENING_CORNER_R = 0.14

const LID_FRONT_Z = LID_THICK / 2
const SCREEN_Z = LID_FRONT_Z + 0.016
const BEZEL_Z = LID_FRONT_Z + 0.024

/** Base tipo Air: estrecha al frente, más altura atrás del teclado */
const BASE_W = 16.5
const BASE_DEPTH = 10.9
const HINGE_H = 0.42
const FRONT_LIP_H = 0.065

/** Perfil trasero alto → frontal bajo — ángulo de la cubierta superior */
const DECK_TILT = Math.atan2(HINGE_H - FRONT_LIP_H, BASE_DEPTH)

/** Reclinación de la tapa respecto a la vertical (la pose "neutra" ya está abierta a 90°). 15° = 105° de apertura total. */
const LID_OPEN = THREE.MathUtils.degToRad(15)

/** Cuña ExtrudeGeometry + centrado + bbox útil para bisagra */
function useMacWedge() {
  return useMemo(() => {
    const shape = new THREE.Shape()
    const halfD = BASE_DEPTH / 2
    shape.moveTo(-halfD, 0)
    shape.lineTo(halfD, 0)
    shape.lineTo(halfD, FRONT_LIP_H)
    shape.lineTo(-halfD, HINGE_H)
    shape.closePath()

    const geo = new THREE.ExtrudeGeometry(shape, {
      steps: 1,
      depth: BASE_W,
      curveSegments: 1,
      bevelEnabled: true,
      bevelThickness: 0.032,
      bevelSize: 0.03,
      bevelSegments: 2,
      bevelOffset: 0,
    })
    geo.rotateY(-Math.PI / 2)
    geo.computeBoundingBox()
    const b0 = geo.boundingBox!.clone()
    geo.translate(-(b0.min.x + b0.max.x) / 2, -(b0.min.y + b0.max.y) / 2, -(b0.min.z + b0.max.z) / 2)
    geo.computeBoundingBox()
    const bx = geo.boundingBox!
    /** Borde trasero donde engancha la tapa — lado de min.z (parte alta de la cuña) */
    const hingeTopY = bx.max.y - 0.018
    const hingeZ = bx.min.z + 0.04
    /** Centro del deck en Z */
    const deckZ = (bx.min.z + bx.max.z) / 2
    /** Profundidad útil del deck */
    const deckDepth = bx.max.z - bx.min.z
    return { geometry: geo, hingeTopY, hingeZ, deckY: bx.max.y - 0.055, deckZ, deckDepth }
  }, [])
}

function useAppleLogoGeometries(): { apple: THREE.ExtrudeGeometry; leaf: THREE.ExtrudeGeometry } {
  return useMemo(() => {
    const sc = 0.74

    const apple = new THREE.Shape()
    apple.absellipse(0, -0.02 * sc, 0.46 * sc, 0.57 * sc, 0, Math.PI * 2, false, 0)
    const bite = new THREE.Path()
    bite.absellipse(0.36 * sc, -0.04 * sc, 0.22 * sc, 0.24 * sc, 0, Math.PI * 2, true)
    apple.holes.push(bite)

    const gApple = new THREE.ExtrudeGeometry(apple, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 36,
    })
    /** Cara trasera (−Z) del logo ligeramente hundida sobre el aluminio */
    gApple.translate(0, 0.05, -(LID_THICK / 2) - 0.034)

    const leaf = new THREE.Shape()
    leaf.absellipse(-0.1 * sc, 0.64 * sc, 0.11 * sc, 0.2 * sc, Math.PI * 0.68, Math.PI * 2.15, false, -0.38)

    const gLeaf = new THREE.ExtrudeGeometry(leaf, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.005,
      bevelSegments: 2,
      curveSegments: 24,
    })
    gLeaf.translate(0, 0.05, -(LID_THICK / 2) - 0.036)

    gApple.computeVertexNormals()
    gLeaf.computeVertexNormals()
    return { apple: gApple, leaf: gLeaf }
  }, [])
}

const logoMatProps = {
  color: '#c8d2dd',
  metalness: 0.94,
  roughness: 0.18,
  clearcoat: 0.8,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.55,
} as const

export function MacBook() {
  const { screenshot, deviceColor, deviceRotation } = useStore()
  const frameMat = useFramePhysicalMaterial(deviceColor)
  const wedge = useMacWedge()
  const { apple: appleGeom, leaf: leafGeom } = useAppleLogoGeometries()

  const bezelGeom = useMemo(() => {
    const outer = roundedRectShape(LID_W - 0.06, LID_H - 0.06, 0.12)
    const hole = roundedHolePath(SCREEN_W, SCREEN_H, SCREEN_OPENING_CORNER_R)
    outer.holes.push(hole)
    return new THREE.ShapeGeometry(outer, 48)
  }, [])

  useEffect(() => {
    const g = wedge.geometry
    const a = appleGeom
    const l = leafGeom
    const b = bezelGeom
    return () => {
      g.dispose()
      a.dispose()
      l.dispose()
      b.dispose()
    }
  }, [wedge.geometry, appleGeom, leafGeom, bezelGeom])

  return (
    <group rotation={deviceRotation}>
      <group position={[0, -1.05, 0]} rotation={[0, -0.22, 0]}>
        {/* Base en cuña */}
        <mesh geometry={wedge.geometry} castShadow receiveShadow>
          <meshPhysicalMaterial {...frameMat} roughness={frameMat.roughness * 0.96} />
        </mesh>

        {/* Área del teclado (rectángulo oscuro, mitad superior del deck cerca de la bisagra) */}
        <mesh
          position={[0, wedge.deckY - 0.05, wedge.deckZ - wedge.deckDepth * 0.16]}
          rotation={[-Math.PI / 2 - DECK_TILT, 0, 0]}
        >
          <planeGeometry args={[BASE_W * 0.92, wedge.deckDepth * 0.55]} />
          <meshPhysicalMaterial color="#0a0c11" metalness={0.35} roughness={0.78} envMapIntensity={0.55} />
        </mesh>

        {/* Trackpad: plano fino, centrado al frente con margen respecto al teclado */}
        <mesh
          position={[0, wedge.deckY - 0.045, wedge.deckZ + wedge.deckDepth * 0.28]}
          rotation={[-Math.PI / 2 - DECK_TILT, 0, 0]}
        >
          <planeGeometry args={[6.4, wedge.deckDepth * 0.22]} />
          <meshPhysicalMaterial
            color="#0d1017"
            metalness={0.18}
            roughness={0.4}
            clearcoat={0.5}
            clearcoatRoughness={0.32}
            envMapIntensity={0.9}
          />
        </mesh>

        {/* Rejilla altavoces — banda atrás junto a la bisagra */}
        {[-6, -4.85, -3.65, -2.35, -1.1, 1.14, 2.42, 3.72, 4.94, 6.06].map((x) => (
          <mesh
            key={`g-${x}`}
            position={[x, wedge.deckY - 0.04, wedge.deckZ - wedge.deckDepth * 0.42]}
            rotation={[-Math.PI / 2 - DECK_TILT, 0, 0]}
          >
            <circleGeometry args={[0.042, 10]} />
            <meshBasicMaterial color="#050607" toneMapped={false} />
          </mesh>
        ))}

        {/* Tapa + pantalla */}
        <group position={[0, wedge.hingeTopY, wedge.hingeZ]} rotation={[-LID_OPEN, 0, 0]}>
          <group position={[0, LID_H / 2, 0]}>
            <RoundedBox
              args={[LID_W, LID_H, LID_THICK]}
              radius={0.09}
              smoothness={5}
              castShadow
              receiveShadow
            >
              <meshPhysicalMaterial {...frameMat} roughness={frameMat.roughness * 0.9} envMapIntensity={frameMat.envMapIntensity * 1.02} />
            </RoundedBox>

            <RoundedBox
              args={[SCREEN_W + 0.04, SCREEN_H + 0.04, 0.048]}
              radius={SCREEN_OPENING_CORNER_R + 0.05}
              smoothness={4}
              position={[0, 0, LID_FRONT_Z - 0.036]}
            >
              <meshPhysicalMaterial
                color="#030305"
                metalness={0.06}
                roughness={0.12}
                clearcoat={1}
                clearcoatRoughness={0.03}
                envMapIntensity={1.05}
              />
            </RoundedBox>

            <ScreenshotPlane
              screenshot={screenshot}
              screenW={SCREEN_W}
              screenH={SCREEN_H}
              openingCornerR={SCREEN_OPENING_CORNER_R}
              z={SCREEN_Z}
              flipTexture180
            />

            <mesh position={[0, 0, BEZEL_Z]} geometry={bezelGeom}>
              <meshBasicMaterial color="#000" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>

            {/* Muesca tipo “housing” centro superior */}
            <mesh position={[0, SCREEN_H * 0.468, BEZEL_Z + 0.008]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.092, 0.34, 6, 10]} />
              <meshBasicMaterial color="#0a0b0d" toneMapped={false} />
            </mesh>

            {/*  en la cara exterior (−Z) */}
            <mesh geometry={appleGeom}>
              <meshPhysicalMaterial {...logoMatProps} />
            </mesh>
            <mesh geometry={leafGeom}>
              <meshPhysicalMaterial {...logoMatProps} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
