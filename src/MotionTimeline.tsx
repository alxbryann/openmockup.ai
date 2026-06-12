import { useStore } from './store'
import type { CameraKeyframe } from './cameraMotionPresets'

/** Keyframe timeline scrubber for camera motion (phase 2). */
export function MotionTimeline() {
  const cameraKeyframes = useStore((s) => s.cameraKeyframes)
  const cameraMotion = useStore((s) => s.cameraMotion)
  const animationTime = useStore((s) => s.animationTime)
  const setAnimationTime = useStore((s) => s.setAnimationTime)
  const setCameraKeyframes = useStore((s) => s.setCameraKeyframes)

  const duration = cameraMotion?.durationSec ?? 6

  if (cameraKeyframes.length === 0) {
    return (
      <p style={{ fontSize: 11, color: 'var(--fg-3)', margin: 0 }}>
        Add keyframes in Motion panel to build a custom camera path.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.05}
        value={animationTime}
        onChange={(e) => setAnimationTime(Number(e.target.value))}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 11, color: 'var(--fg-2)' }}>
        {cameraKeyframes.map((kf, i) => (
          <li
            key={`${kf.time}-${i}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span>{kf.time.toFixed(1)}s</span>
            <button
              type="button"
              onClick={() => setCameraKeyframes(cameraKeyframes.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function interpolateKeyframesAt(keyframes: CameraKeyframe[]) {
  return keyframes
}
