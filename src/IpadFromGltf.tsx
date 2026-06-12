import { RoundedBox } from '@react-three/drei'
import { ScreenshotPlane } from './ScreenshotPlane'
import type { ScreenMediaKind } from './store'

const TARGET_H = 18

/** Procedural iPad — landscape tablet with screen overlay */
export function IpadFromGltf({
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
  const bodyW = 10.5
  const bodyH = 7.2
  const bodyD = 0.35
  const screenW = 9.6
  const screenH = 6.8

  return (
    <group scale={[TARGET_H / bodyH, TARGET_H / bodyH, TARGET_H / bodyH]}>
      <RoundedBox args={[bodyW, bodyH, bodyD]} radius={0.15} smoothness={4} position={[0, 0, 0]}>
        <meshPhysicalMaterial color={deviceColor} metalness={0.85} roughness={0.35} envMapIntensity={1.1} />
      </RoundedBox>
      <ScreenshotPlane
        deviceId={deviceId}
        screenshot={screenshot}
        screenMediaKind={screenMediaKind}
        screenW={screenW}
        screenH={screenH}
        openingCornerR={0.2}
        z={bodyD / 2 + 0.02}
      />
    </group>
  )
}
