import { RoundedBox } from '@react-three/drei'
import { ScreenshotPlane } from './ScreenshotPlane'
import type { ScreenMediaKind } from './store'

const TARGET_H = 5.5

/** Procedural Apple Watch — compact square screen */
export function WatchFromGltf({
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
  const caseSize = 2.8
  const screenSize = 2.2

  return (
    <group scale={[TARGET_H / caseSize, TARGET_H / caseSize, TARGET_H / caseSize]}>
      <RoundedBox args={[caseSize, caseSize, 0.45]} radius={0.35} smoothness={6}>
        <meshPhysicalMaterial color={deviceColor} metalness={0.9} roughness={0.28} envMapIntensity={1.2} />
      </RoundedBox>
      <ScreenshotPlane
        deviceId={deviceId}
        screenshot={screenshot}
        screenMediaKind={screenMediaKind}
        screenW={screenSize}
        screenH={screenSize}
        openingCornerR={0.35}
        z={0.24}
      />
    </group>
  )
}
