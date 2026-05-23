import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, useProgress } from '@react-three/drei'
import { Suspense } from 'react'
import { MacBook } from './MacBook'
import { MacBookFromGltf } from './MacBookFromGltf'
import { PhoneFromGltf } from './PhoneFromGltf'
import { PhoneProcedural } from './PhoneProcedural'
import { useStore, type DeviceInstance } from './store'
import { captureSceneToPngDataUrl } from './highResCapture'
import { isGradientBg } from './gradients'
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
  interactive,
  onPointerDown,
}: {
  device: DeviceInstance
  interactive: boolean
  onPointerDown: (e: ThreeEvent<PointerEvent>, deviceId: string) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.raycast = interactive
        ? (raycaster, intersects) => THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects)
        : () => null
    })
  }, [interactive, device.id, device.deviceKind])

  return (
    <group
      ref={groupRef}
      position={[device.positionX, device.positionY, 0]}
      rotation={device.deviceRotation}
      onPointerDown={interactive ? (e) => onPointerDown(e, device.id) : undefined}
    >
      {device.deviceKind === 'phone' ? (
        <Suspense
          fallback={
            <PhoneProcedural
              deviceId={device.id}
              screenshot={device.screenshot}
              screenMediaKind={device.screenMediaKind}
              deviceColor={device.deviceColor}
            />
          }
        >
          <PhoneFromGltf
            deviceId={device.id}
            screenshot={device.screenshot}
            screenMediaKind={device.screenMediaKind}
            deviceColor={device.deviceColor}
          />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <MacBook
              deviceId={device.id}
              screenshot={device.screenshot}
              screenMediaKind={device.screenMediaKind}
              deviceColor={device.deviceColor}
            />
          }
        >
          <MacBookFromGltf
            deviceId={device.id}
            screenshot={device.screenshot}
            screenMediaKind={device.screenMediaKind}
            deviceColor={device.deviceColor}
          />
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
        <DeviceGroup
          key={device.id}
          device={device}
          interactive={!cameraPanFree}
          onPointerDown={startDrag}
        />
      ))}
    </>
  )
}

const rollQuat = new THREE.Quaternion()
const rollAxis = new THREE.Vector3(0, 0, -1)

/** Camera nav: left-drag look is custom; OrbitControls only dollies/pans. */
const MOUSE_CAMERA_NAV_MODE = { LEFT: -1, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } as const
const TOUCH_CAMERA_NAV_MODE = { ONE: -1, TWO: TOUCH.DOLLY_PAN } as const

const LOOK_SENSITIVITY = 0.0035
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.06
const lookOffset = new THREE.Vector3()
const lookRight = new THREE.Vector3()
const lookPos = new THREE.Vector3()

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const wasdForward = new THREE.Vector3()
const wasdRight = new THREE.Vector3()
const wasdUp = new THREE.Vector3()
const wasdMove = new THREE.Vector3()

/** World units per second at orbit distance 28; scales with zoom distance. */
const WASD_MOVE_SPEED = 14

type WasdKeys = { w: boolean; a: boolean; s: boolean; d: boolean }

function emptyWasdKeys(): WasdKeys {
  return { w: false, a: false, s: false, d: false }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el?.closest('input, textarea, select, [contenteditable="true"]')
}

function applyCameraLook(ctl: OrbitControlsImpl, dx: number, dy: number) {
  const cam = ctl.object as THREE.PerspectiveCamera
  lookPos.copy(cam.position)
  lookOffset.subVectors(ctl.target, lookPos)
  const dist = lookOffset.length()
  if (dist < 1e-6) return

  lookOffset.applyAxisAngle(WORLD_UP, -dx * LOOK_SENSITIVITY)

  lookRight.crossVectors(lookOffset, WORLD_UP)
  if (lookRight.lengthSq() > 1e-8) {
    lookRight.normalize()
    lookOffset.applyAxisAngle(lookRight, -dy * LOOK_SENSITIVITY)
  }

  const horiz = Math.hypot(lookOffset.x, lookOffset.z)
  if (horiz > 1e-6) {
    const minY = Math.tan(-LOOK_PITCH_LIMIT) * horiz
    const maxY = Math.tan(LOOK_PITCH_LIMIT) * horiz
    lookOffset.y = Math.min(maxY, Math.max(minY, lookOffset.y))
  }

  lookOffset.normalize().multiplyScalar(dist)
  ctl.target.copy(lookPos).add(lookOffset)
  ctl.update()
}

/** Cinematographer look: drag to aim the camera; devices stay fixed in the scene. */
function CameraLookDrag({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const gl = useThree((s) => s.gl)
  const cameraPanFree = useStore((s) => s.cameraPanFree)
  const draggingRef = useRef(false)
  const lastRef = useRef({ x: 0, y: 0 })
  const touchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!cameraPanFree) {
      draggingRef.current = false
      touchIdRef.current = null
      return
    }

    const el = gl.domElement

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      if (isTypingTarget(e.target)) return
      draggingRef.current = true
      lastRef.current = { x: e.clientX, y: e.clientY }
      touchIdRef.current = e.pointerId
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }

    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current || touchIdRef.current !== e.pointerId) return
      const dx = e.clientX - lastRef.current.x
      const dy = e.clientY - lastRef.current.y
      lastRef.current = { x: e.clientX, y: e.clientY }
      if (dx === 0 && dy === 0) return
      const ctl = controlsRef.current
      if (!ctl) return
      applyCameraLook(ctl, dx, dy)
      e.preventDefault()
    }

    function endPointer(e: PointerEvent) {
      if (touchIdRef.current !== e.pointerId) return
      draggingRef.current = false
      touchIdRef.current = null
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
      draggingRef.current = false
      touchIdRef.current = null
    }
  }, [cameraPanFree, gl.domElement, controlsRef])

  return null
}

/** WASD + Space/Shift vertical fly through 3D space. Moves camera and orbit target together. */
function CameraWasdMovement({
  controlsRef,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const cameraPanFree = useStore((s) => s.cameraPanFree)
  const keysRef = useRef<WasdKeys>(emptyWasdKeys())
  const spaceRef = useRef(false)
  const shiftDownRef = useRef(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!useStore.getState().cameraPanFree) return
      if (isTypingTarget(e.target)) return
      if (e.key === 'Shift') {
        e.preventDefault()
        shiftDownRef.current = true
        return
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        spaceRef.current = true
        return
      }
      const k = e.key.toLowerCase()
      if (k !== 'w' && k !== 'a' && k !== 's' && k !== 'd') return
      e.preventDefault()
      keysRef.current[k] = true
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        shiftDownRef.current = false
        return
      }
      if (e.code === 'Space' || e.key === ' ') {
        spaceRef.current = false
        return
      }
      const k = e.key.toLowerCase()
      if (k !== 'w' && k !== 'a' && k !== 's' && k !== 'd') return
      keysRef.current[k] = false
    }

    function clearKeys() {
      keysRef.current = emptyWasdKeys()
      spaceRef.current = false
      shiftDownRef.current = false
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearKeys)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
      clearKeys()
    }
  }, [])

  useFrame((_, delta) => {
    if (!cameraPanFree) return
    const ctl = controlsRef.current
    if (!ctl) return
    const keys = keysRef.current
    const space = spaceRef.current
    const shiftDown = shiftDownRef.current
    if (!keys.w && !keys.a && !keys.s && !keys.d && !space && !shiftDown) return

    const cam = ctl.object as THREE.PerspectiveCamera
    wasdForward.subVectors(ctl.target, cam.position)
    if (wasdForward.lengthSq() < 1e-8) wasdForward.set(0, 0, -1)
    else wasdForward.normalize()

    wasdRight.crossVectors(wasdForward, WORLD_UP)
    if (wasdRight.lengthSq() < 1e-8) wasdRight.set(1, 0, 0)
    else wasdRight.normalize()

    wasdUp.crossVectors(wasdRight, wasdForward).normalize()

    wasdMove.set(0, 0, 0)
    if (keys.w) wasdMove.add(wasdForward)
    if (keys.s) wasdMove.sub(wasdForward)
    if (keys.d) wasdMove.add(wasdRight)
    if (keys.a) wasdMove.sub(wasdRight)
    if (space) wasdMove.add(wasdUp)
    if (shiftDown) wasdMove.sub(wasdUp)
    if (wasdMove.lengthSq() < 1e-8) return

    wasdMove.normalize()
    const distScale = Math.max(ctl.getDistance(), 4) / 28
    const speed = WASD_MOVE_SPEED * distScale * delta
    wasdMove.multiplyScalar(speed)

    cam.position.add(wasdMove)
    ctl.target.add(wasdMove)
    ctl.update()
  })

  return null
}

function OrbitWithRoll({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const cameraRoll = useStore((s) => s.cameraRoll)
  const cameraPanFree = useStore((s) => s.cameraPanFree)
  const hydrationSeq = useStore((s) => s.hydrationSeq)
  const lastOrbitDistRef = useRef<number | null>(null)
  const lastPoseKeyRef = useRef<string | null>(null)

  // When the studio hydrates a project, snap the camera to the saved pose.
  useEffect(() => {
    let cancelled = false
    function apply() {
      if (cancelled) return
      const ctl = controlsRef.current
      if (!ctl) {
        requestAnimationFrame(apply)
        return
      }
      const s = useStore.getState()
      const cam = ctl.object as THREE.PerspectiveCamera
      const [px, py, pz] = s.cameraPosition
      const [tx, ty, tz] = s.cameraTarget
      cam.position.set(px, py, pz)
      ctl.target.set(tx, ty, tz)
      ctl.update()
      const dist = cam.position.distanceTo(ctl.target)
      lastOrbitDistRef.current = Math.round(dist * 10) / 10
      lastPoseKeyRef.current = `${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)}|${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(2)}`
    }
    apply()
    return () => {
      cancelled = true
    }
  }, [hydrationSeq, controlsRef])

  const mouseButtons = useMemo(
    () => (cameraPanFree ? MOUSE_CAMERA_NAV_MODE : MOUSE_DEVICE_VIEW_MODE),
    [cameraPanFree],
  )
  const touches = useMemo(
    () => (cameraPanFree ? TOUCH_CAMERA_NAV_MODE : TOUCH_DEVICE_VIEW_MODE),
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
      // Don't write back to the store until the hydration apply() has set the baseline.
      // Otherwise we'd overwrite a freshly-hydrated pose with the camera's default.
      if (lastOrbitDistRef.current !== null && lastOrbitDistRef.current !== stepped) {
        lastOrbitDistRef.current = stepped
        useStore.getState().setOrbitDistance(stepped)
      }
      if (lastPoseKeyRef.current !== null) {
        const cam = ctl.object as THREE.PerspectiveCamera
        const px = Math.round(cam.position.x * 100) / 100
        const py = Math.round(cam.position.y * 100) / 100
        const pz = Math.round(cam.position.z * 100) / 100
        const tx = Math.round(ctl.target.x * 100) / 100
        const ty = Math.round(ctl.target.y * 100) / 100
        const tz = Math.round(ctl.target.z * 100) / 100
        const key = `${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)}|${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(2)}`
        if (key !== lastPoseKeyRef.current) {
          lastPoseKeyRef.current = key
          useStore.getState().setCameraPose([px, py, pz], [tx, ty, tz])
        }
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
      screenSpacePanning={false}
      enableRotate={!cameraPanFree}
      mouseButtons={mouseButtons as any}
      touches={touches as any}
      autoRotate={false}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
    />
  )
}

function SceneBackgroundSync() {
  const bgColor = useStore((s) => s.bgColor)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    if (isGradientBg(bgColor)) {
      scene.background = null
    }
  }, [bgColor, scene])

  if (isGradientBg(bgColor)) return null
  return <color attach="background" args={[bgColor]} />
}

function SceneCaptureRegistration() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const setCaptureSceneAtSize = useStore((s) => s.setCaptureSceneAtSize)

  useEffect(() => {
    const impl = (width: number, height: number, opts?: { transparent?: boolean; bgCss?: string }) =>
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

function SceneLoadingMonitor({ onReady }: { onReady?: () => void }) {
  const { active } = useProgress()
  const wasActiveRef = useRef(false)
  const calledRef = useRef(false)

  useEffect(() => {
    if (active) wasActiveRef.current = true
    if (!active && wasActiveRef.current && !calledRef.current) {
      calledRef.current = true
      onReady?.()
    }
  }, [active, onReady])

  // Fallback: fire after 4 s regardless (e.g. if DefaultLoadingManager never fires)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true
        onReady?.()
      }
    }, 4000)
    return () => clearTimeout(t)
  }, [onReady])

  return null
}

function SceneWorld({ onReady }: { onReady?: () => void }) {
  const devices = useStore((s) => s.devices)
  const activeDeviceId = useStore((s) => s.activeDeviceId)
  const activeDevice = devices.find((d) => d.id === activeDeviceId) ?? devices[0]
  const orbitControlsRef = useRef<OrbitControlsImpl>(null)

  return (
    <>
      <SceneLoadingMonitor onReady={onReady} />
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
      <CameraLookDrag controlsRef={orbitControlsRef} />
      <CameraWasdMovement controlsRef={orbitControlsRef} />
    </>
  )
}

export const Scene = forwardRef<HTMLCanvasElement, { onReady?: () => void }>(
  function Scene({ onReady }, ref) {
    const bgColor = useStore((s) => s.bgColor)
    const stableOnReady = useCallback(() => onReady?.(), [onReady])

    return (
      <div style={{ width: '100%', height: '100%', background: bgColor }}>
        <Canvas
          ref={ref}
          shadows
          camera={{ position: [0, 0, 28], fov: 28 }}
          gl={{ preserveDrawingBuffer: true, antialias: true, toneMappingExposure: 0.94, alpha: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <SceneWorld onReady={stableOnReady} />
        </Canvas>
      </div>
    )
  },
)
