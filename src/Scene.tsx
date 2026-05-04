import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { MacBook } from './MacBook'
import { Phone } from './Phone'
import { useStore } from './store'
import { captureSceneToPngDataUrl } from './highResCapture'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MOUSE, TOUCH } from 'three'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

const rollQuat = new THREE.Quaternion()
const rollAxis = new THREE.Vector3(0, 0, -1)

/** Pan con clic izquierdo; en modo normal el izquierdo es órbita. */
const MOUSE_PAN_MODE = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE } as const
const MOUSE_ORBIT_MODE = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } as const
const TOUCH_PAN_MODE = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } as const
const TOUCH_ORBIT_MODE = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN } as const

function OrbitWithRoll() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const cameraRoll = useStore((s) => s.cameraRoll)
  const autoRotate = useStore((s) => s.autoRotate)
  const cameraPanFree = useStore((s) => s.cameraPanFree)

  const mouseButtons = useMemo(
    () => (cameraPanFree ? MOUSE_PAN_MODE : MOUSE_ORBIT_MODE),
    [cameraPanFree],
  )
  const touches = useMemo(() => (cameraPanFree ? TOUCH_PAN_MODE : TOUCH_ORBIT_MODE), [cameraPanFree])

  useLayoutEffect(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    if (cameraPanFree) canvas.style.cursor = 'grab'
    else canvas.style.cursor = ''
    return () => {
      canvas.style.cursor = ''
    }
  }, [cameraPanFree])

  useEffect(() => {
    if (!cameraPanFree) return
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const onDown = () => {
      canvas.style.cursor = 'grabbing'
    }
    const onUp = () => {
      canvas.style.cursor = 'grab'
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [cameraPanFree])

  useFrame(() => {
    const ctl = controlsRef.current
    if (!ctl || cameraRoll === 0) return
    const cam = ctl.object as THREE.PerspectiveCamera
    rollQuat.setFromAxisAngle(rollAxis, cameraRoll)
    cam.quaternion.multiply(rollQuat)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={cameraPanFree}
      screenSpacePanning={cameraPanFree}
      enableRotate={!cameraPanFree}
      mouseButtons={mouseButtons}
      touches={touches}
      autoRotate={cameraPanFree ? false : autoRotate}
      autoRotateSpeed={1.2}
      minDistance={18}
      maxDistance={50}
    />
  )
}

function SceneBackgroundSync() {
  const bgColor = useStore((s) => s.bgColor)
  return <color attach="background" args={[bgColor]} />
}

function SceneCaptureRegistration() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const setCaptureSceneAtSize = useStore((s) => s.setCaptureSceneAtSize)

  useEffect(() => {
    const impl = (width: number, height: number) =>
      captureSceneToPngDataUrl(gl, scene, camera as THREE.PerspectiveCamera, width, height)
    setCaptureSceneAtSize(impl)
    return () => setCaptureSceneAtSize(null)
  }, [gl, scene, camera, setCaptureSceneAtSize])
  return null
}

export const Scene = forwardRef<HTMLCanvasElement>(function Scene(_props, ref) {
  const bgColor = useStore((s) => s.bgColor)
  const deviceKind = useStore((s) => s.deviceKind)

  return (
    <Canvas
      ref={ref}
      shadows
      camera={{ position: [0, 0, 28], fov: 28 }}
      gl={{ preserveDrawingBuffer: true, antialias: true, toneMappingExposure: 0.94 }}
      style={{ background: bgColor, width: '100%', height: '100%' }}
    >
      <SceneBackgroundSync />
      <SceneCaptureRegistration />
      <ambientLight intensity={0.2} />
      <hemisphereLight args={['#f2f4ff', '#1a1c22', 0.35]} position={[0, 1, 0]} />
      <directionalLight
        position={[9, 11, 7]}
        intensity={1.05}
        castShadow
        color="#fffaf4"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={40}
        shadow-camera-near={4}
        shadow-bias={-0.00015}
      />
      <directionalLight position={[-11, 2, -4]} intensity={0.38} color="#c8d8ff" />
      <directionalLight position={[2, -4, -14]} intensity={0.42} color="#ffffff" />
      <pointLight position={[0, 7, 6]} intensity={0.22} color="#fff5eb" />

      {deviceKind === 'phone' ? <Phone /> : <MacBook />}

      <ContactShadows
        position={[0, -9, 0]}
        opacity={0.55}
        scale={deviceKind === 'mac' ? 34 : 22}
        blur={2.8}
        far={12}
      />
      <Environment preset="studio" environmentIntensity={0.74} />
      <OrbitWithRoll />
    </Canvas>
  )
})
