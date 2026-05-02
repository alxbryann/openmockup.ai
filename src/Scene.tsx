import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { Phone } from './Phone'
import { useStore } from './store'
import { forwardRef, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

const rollQuat = new THREE.Quaternion()
const rollAxis = new THREE.Vector3(0, 0, -1)

function OrbitWithRoll() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const cameraRoll = useStore((s) => s.cameraRoll)
  const autoRotate = useStore((s) => s.autoRotate)

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
      enablePan={false}
      autoRotate={autoRotate}
      autoRotateSpeed={1.2}
      minDistance={18}
      maxDistance={50}
    />
  )
}

export const Scene = forwardRef<HTMLCanvasElement>(function Scene(_props, ref) {
  const { bgColor } = useStore()

  return (
    <Canvas
      ref={ref}
      shadows
      camera={{ position: [0, 0, 28], fov: 28 }}
      gl={{ preserveDrawingBuffer: true, antialias: true, toneMappingExposure: 0.85 }}
      style={{ background: bgColor, width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 6]} intensity={0.7} castShadow />
      <directionalLight position={[-6, -3, -4]} intensity={0.25} color="#aabbff" />
      <pointLight position={[0, 8, 5]} intensity={0.3} />

      <Phone />

      <ContactShadows
        position={[0, -9, 0]}
        opacity={0.55}
        scale={22}
        blur={2.8}
        far={12}
      />
      <Environment preset="apartment" environmentIntensity={0.4} />
      <OrbitWithRoll />
    </Canvas>
  )
})
