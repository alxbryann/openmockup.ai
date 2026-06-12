import * as THREE from 'three'
import type { CameraPose } from './cameraPresets'

/** Apply a camera pose directly to the live WebGL camera (bypasses React re-render lag). */
export function syncLiveCameraFromPose(pose: CameraPose): void {
  const ctx = (window as unknown as { __mockitCtx?: { camera: THREE.PerspectiveCamera } }).__mockitCtx
  if (!ctx?.camera) return
  const cam = ctx.camera
  cam.position.set(pose.cameraPosition[0], pose.cameraPosition[1], pose.cameraPosition[2])
  cam.up.set(0, 1, 0)
  cam.lookAt(pose.cameraTarget[0], pose.cameraTarget[1], pose.cameraTarget[2])
  if (pose.cameraRoll !== 0) {
    cam.rotateZ(pose.cameraRoll)
  }
  cam.updateProjectionMatrix()
}

export function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    function tick() {
      if (++count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export function ensureEven(n: number): number {
  const v = Math.max(2, Math.round(n))
  return v % 2 === 0 ? v : v - 1
}
