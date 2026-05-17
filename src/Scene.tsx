import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { Suspense } from 'react'
import { MacBook } from './MacBook'
import { MacBookFromGltf } from './MacBookFromGltf'
import { PhoneFromGltf } from './PhoneFromGltf'
import { PhoneProcedural } from './PhoneProcedural'
import { useStore, type DeviceInstance } from './store'
import { captureSceneToPngDataUrl } from './highResCapture'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MOUSE, TOUCH } from 'three'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

const DEVICE_DRAG_SENS = 0.007
const DEVICE_AUTO_ROTATE_SPEED = 1.2
/** Camera FOV in degrees — must match the Canvas camera prop. */
const CAMERA_FOV_DEG = 28

export const ORBIT_MIN_DISTANCE = 18
export const ORBIT_MAX_DISTANCE = 50

/**
 * Zoom en la UI = (esta distancia ÷ distancia de órbita) — ~2× al máximo acercamiento, ~0.7× al alejar.
 */
export const ORBIT_ZOOM_REF_DISTANCE = ORBIT_MIN_DISTANCE * 2

const MOUSE_DEVICE_VIEW_MODE = {
  LEFT: -1,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.ROTATE,
} as { LEFT: number; MIDDLE: MOUSE; RIGHT: MOUSE }

const TOUCH_DEVICE_VIEW_MODE = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } as const

function DeviceGroup({
  device,
  onPointerDown,
}: {
  device: DeviceInstance
  onPointerDown: (e: ThreeEvent<PointerEvent>, deviceId: string) => void
}) {
  return (
    <group
      position={[device.positionX, device.positionY, 0]}
      rotation={device.deviceRotation}
      onPointerDown={(e) => onPointerDown(e, device.id)}
    >
      {device.deviceKind === 'phone' ? (
        <Suspense
          fallback={
            <PhoneProcedural screenshot={device.screenshot} deviceColor={device.deviceColor} />
          }
        >
          <PhoneFromGltf screenshot={device.screenshot} deviceColor={device.deviceColor} />
        </Suspense>
      ) : (
        <Suspense
          fallback={<MacBook screenshot={device.screenshot} deviceColor={device.deviceColor} />}
        >
          <MacBookFromGltf screenshot={device.screenshot} deviceColor={device.deviceColor} />
        </Suspense>
      )}
    </group>
  )
}

function DeviceScene({
  orbitControlsRef,
}: {
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const devices = useStore((s) => s.devices)
  const setActiveDeviceId = useStore((s) => s.setActiveDeviceId)
  const setDeviceRotation = useStore((s) => s.setDeviceRotation)
  const updateDevice = useStore((s) => s.updateDevice)
  const tickAutoRotate = useStore((s) => s.tickAutoRotate)
  const autoRotate = useStore((s) => s.autoRotate)
  const cameraPanFree = useStore((s) => s.cameraPanFree)
  const deviceDragMode = useStore((s) => s.deviceDragMode)
  const orbitDistance = useStore((s) => s.orbitDistance)

  // Keep refs for use inside window event handlers (stable closure)
  const dragDeviceIdRef = useRef<string | null>(null)
  const lastRef = useRef({ x: 0, y: 0 })
  const dragModeRef = useRef(deviceDragMode)
  const orbitDistanceRef = useRef(orbitDistance)
  const sizeRef = useRef(size)
  useEffect(() => { dragModeRef.current = deviceDragMode }, [deviceDragMode])
  useEffect(() => { orbitDistanceRef.current = orbitDistance }, [orbitDistance])
  useEffect(() => { sizeRef.current = size }, [size])

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const did = dragDeviceIdRef.current
      if (!did) return
      const dx = e.clientX - lastRef.current.x
      const dy = e.clientY - lastRef.current.y
      lastRef.current = { x: e.clientX, y: e.clientY }
      const device = useStore.getState().devices.find((d) => d.id === did)
      if (!device) return

      if (dragModeRef.current === 'move') {
        // Pixel → world: at device plane (z=0), visible height = 2 * dist * tan(fov/2)
        const visibleH = 2 * orbitDistanceRef.current * Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))
        const sens = visibleH / sizeRef.current.height
        updateDevice(did, {
          positionX: device.positionX + dx * sens,
          positionY: device.positionY - dy * sens,
        })
      } else if (e.shiftKey) {
        const [rx, ry, rz] = device.deviceRotation
        setDeviceRotation(did, [rx, ry, rz - dx * DEVICE_DRAG_SENS])
      } else {
        const [rx, ry, rz] = device.deviceRotation
        setDeviceRotation(did, [rx + dy * DEVICE_DRAG_SENS, ry + dx * DEVICE_DRAG_SENS, rz])
      }
    }
    function endDrag(e: PointerEvent) {
      if (!dragDeviceIdRef.current) return
      dragDeviceIdRef.current = null
      try {
        gl.domElement.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      const ctl = orbitControlsRef.current
      if (ctl) ctl.enabled = true
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [gl.domElement, orbitControlsRef, setDeviceRotation, updateDevice])

  useFrame(() => {
    if (!autoRotate || cameraPanFree || dragDeviceIdRef.current) return
    const step = ((2 * Math.PI) / 3600) * DEVICE_AUTO_ROTATE_SPEED
    tickAutoRotate(step)
  })

  function startDrag(e: ThreeEvent<PointerEvent>, deviceId: string) {
    if (cameraPanFree || e.button !== 0) return
    e.stopPropagation()
    setActiveDeviceId(deviceId)
    dragDeviceIdRef.current = deviceId
    lastRef.current = { x: e.clientX, y: e.clientY }
    const ctl = orbitControlsRef.current
    if (ctl) ctl.enabled = false
    try {
      gl.domElement.setPointerCapture(e.pointerId)
    } catch {
      /* invalid pointer id */
    }
  }

  return (
    <>
      {!cameraPanFree ? (
        <mesh
          position={[0, 0, -56]}
          onPointerDown={(e) => {
            const aid = useStore.getState().activeDeviceId
            startDrag(e, aid)
          }}
        >
          <planeGeometry args={[480, 480]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
      {devices.map((device) => (
        <DeviceGroup key={device.id} device={device} onPointerDown={startDrag} />
      ))}
    </>
  )
}

const rollQuat = new THREE.Quaternion()
const rollAxis = new THREE.Vector3(0, 0, -1)

const MOUSE_PAN_MODE = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE } as const
const TOUCH_PAN_MODE = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } as const

function OrbitWithRoll({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const cameraRoll = useStore((s) => s.cameraRoll)
  const cameraPanFree = useStore((s) => s.cameraPanFree)
  const lastOrbitDistRef = useRef<number | null>(null)

  const mouseButtons = useMemo(
    () => (cameraPanFree ? MOUSE_PAN_MODE : MOUSE_DEVICE_VIEW_MODE),
    [cameraPanFree],
  )
  const touches = useMemo(
    () => (cameraPanFree ? TOUCH_PAN_MODE : TOUCH_DEVICE_VIEW_MODE),
    [cameraPanFree],
  )

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
    if (ctl) {
      const d = ctl.getDistance()
      const stepped = Math.round(d * 10) / 10
      if (lastOrbitDistRef.current !== stepped) {
        lastOrbitDistRef.current = stepped
        useStore.getState().setOrbitDistance(stepped)
      }
    }
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
      mouseButtons={mouseButtons as any}
      touches={touches}
      autoRotate={false}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
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
    const impl = (width: number, height: number, opts?: { transparent?: boolean }) =>
      captureSceneToPngDataUrl(gl, scene, camera as THREE.PerspectiveCamera, width, height, opts)
    setCaptureSceneAtSize(impl)
    ;(window as any).__mockitCtx = { gl, scene, camera }
    return () => {
      setCaptureSceneAtSize(null)
      ;(window as any).__mockitCtx = null
    }
  }, [gl, scene, camera, setCaptureSceneAtSize])
  return null
}

function SceneContactShadows({ deviceKind }: { deviceKind: 'phone' | 'mac' }) {
  const groupRef = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        ;(o as THREE.Mesh).raycast = () => {}
      }
    })
  }, [deviceKind])
  return (
    <ContactShadows
      ref={groupRef}
      position={[0, -9, 0]}
      opacity={0.55}
      scale={deviceKind === 'mac' ? 34 : 22}
      blur={2.8}
      far={12}
    />
  )
}

function SceneWorld() {
  const devices = useStore((s) => s.devices)
  const activeDeviceId = useStore((s) => s.activeDeviceId)
  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? devices[0]
  const orbitControlsRef = useRef<OrbitControlsImpl>(null)

  return (
    <>
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

      <DeviceScene orbitControlsRef={orbitControlsRef} />

      <SceneContactShadows deviceKind={activeDevice?.deviceKind ?? 'phone'} />
      <Environment preset="studio" environmentIntensity={0.74} />
      <OrbitWithRoll controlsRef={orbitControlsRef} />
    </>
  )
}

export const Scene = forwardRef<HTMLCanvasElement>(function Scene(_props, ref) {
  const bgColor = useStore((s) => s.bgColor)

  return (
    <Canvas
      ref={ref}
      shadows
      camera={{ position: [0, 0, 28], fov: 28 }}
      gl={{ preserveDrawingBuffer: true, antialias: true, toneMappingExposure: 0.94 }}
      style={{ background: bgColor, width: '100%', height: '100%' }}
    >
      <SceneWorld />
    </Canvas>
  )
})
