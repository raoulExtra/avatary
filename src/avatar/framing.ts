import { Box3, PerspectiveCamera, Vector3, type Object3D } from 'three'
import type { VRM } from '@pixiv/three-vrm'

export type VrmFrame = {
  readonly target: Vector3
  readonly distance: number
  readonly near: number
  readonly far: number
  readonly source: 'landmarks' | 'bounds'
}

export type FrameOptions = {
  readonly verticalFovDegrees?: number
  readonly padding?: number
  readonly minDistance?: number
  readonly maxDistance?: number
}

const DEFAULTS = {
  verticalFovDegrees: 28,
  padding: 1.18,
  minDistance: 0.25,
  maxDistance: 20,
} as const

function landmark(vrm: VRM, name: string): Object3D | undefined {
  const humanoid = vrm.humanoid as { getNormalizedBoneNode?: (bone: string) => Object3D | null } | undefined
  return humanoid?.getNormalizedBoneNode?.(name) ?? undefined
}

/** Compute a stable head/eye target, falling back to bounded world-space model bounds. */
export function calculateVrmFrame(vrm: VRM, options: FrameOptions = {}): VrmFrame {
  const root = vrm.scene
  const bounds = new Box3().setFromObject(root)
  const rawSize = bounds.getSize(new Vector3())
  const height = Math.min(Math.max(rawSize.y, 0.5), 10)
  const fallbackTarget = bounds.isEmpty()
    ? new Vector3(0, Math.min(height * 0.58, 6), 0)
    : new Vector3(
        (bounds.min.x + bounds.max.x) / 2,
        Math.min(Math.max(bounds.min.y + height * 0.62, bounds.min.y), bounds.max.y),
        (bounds.min.z + bounds.max.z) / 2,
      )

  const head = landmark(vrm, 'head')
  const leftEye = landmark(vrm, 'leftEye')
  const rightEye = landmark(vrm, 'rightEye')
  const target = new Vector3()
  let source: VrmFrame['source'] = 'bounds'
  if (leftEye && rightEye) {
    leftEye.getWorldPosition(target)
    const right = rightEye.getWorldPosition(new Vector3())
    target.lerp(right, 0.5)
    source = 'landmarks'
  } else if (head) {
    head.getWorldPosition(target)
    source = 'landmarks'
  } else {
    target.copy(fallbackTarget)
  }

  const fov = Math.min(Math.max(options.verticalFovDegrees ?? DEFAULTS.verticalFovDegrees, 10), 100)
  const padding = Math.min(Math.max(options.padding ?? DEFAULTS.padding, 1), 3)
  const minDistance = Math.max(options.minDistance ?? DEFAULTS.minDistance, 0.05)
  const maxDistance = Math.max(options.maxDistance ?? DEFAULTS.maxDistance, minDistance)
  const fovRadians = (fov * Math.PI) / 180
  const distance = Math.min(Math.max((height * padding * 0.5) / Math.tan(fovRadians / 2), minDistance), maxDistance)
  return {
    target,
    distance,
    near: Math.max(0.01, distance / 100),
    far: Math.max(distance * 20, 10),
    source,
  }
}

/** Apply a computed frame without owning camera position/orientation policy. */
export function applyVrmFrame(camera: PerspectiveCamera, frame: VrmFrame, position?: Vector3): void {
  camera.near = frame.near
  camera.far = frame.far
  camera.updateProjectionMatrix()
  if (position) camera.position.copy(position)
  else camera.position.set(frame.target.x, frame.target.y, frame.target.z + frame.distance)
  camera.lookAt(frame.target)
}
