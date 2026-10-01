import type { Object3D } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { ModelCapabilities, VrmVersion } from '../contracts/capabilities'

/** The parsed VRM and the stable information consumers need from either VRM generation. */
export type LoadedVrm = {
  readonly vrm: VRM
  readonly version: VrmVersion
  readonly capabilities: ModelCapabilities
  readonly dispose: () => void
}

/** Return the root object used for bounds, framing, and scene attachment. */
export function vrmRoot(vrm: VRM): Object3D {
  return vrm.scene
}

export function detectVrmVersion(vrm: VRM): VrmVersion {
  const version = String(vrm.meta?.version ?? '').trim().replace(/^v/iu, '')
  if (version === '0' || version.startsWith('0.')) return '0.x'
  if (version === '1' || version.startsWith('1.')) return '1.0'
  throw new Error(`Unsupported VRM metadata version: ${version || 'missing'}`)
}

function hasExpression(vrm: VRM, ...names: string[]): boolean {
  const manager = vrm.expressionManager as { getExpression?: (name: string) => unknown } | null | undefined
  return Boolean(manager?.getExpression && names.some((name) => manager.getExpression?.(name)))
}

export function detectCapabilities(vrm: VRM, version: VrmVersion): ModelCapabilities {
  const expressions = Boolean(vrm.expressionManager)
  const gaze = Boolean(vrm.lookAt)
  const blink = hasExpression(vrm, 'blink', 'Blink')
  const mouth = hasExpression(vrm, 'aa', 'A', 'mouthA', 'MouthA')
  const supported = { expressions, gaze, blink, mouth, idleMotion: true } as const
  const unsupported = (Object.keys(supported) as Array<keyof typeof supported>).filter((key) => !supported[key])
  return { version, supported, unsupported }
}
