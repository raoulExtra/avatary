export const VRM_VERSIONS = ['0.x', '1.0'] as const
export type VrmVersion = (typeof VRM_VERSIONS)[number]

/** Capabilities are explicit because VRM 0.x and 1.0 do not expose identical APIs. */
export type AvatarCapabilities = {
  readonly expressions: boolean
  readonly gaze: boolean
  readonly blink: boolean
  readonly mouth: boolean
  readonly idleMotion: boolean
}

export type ModelCapabilities = {
  readonly version: VrmVersion
  readonly supported: Readonly<AvatarCapabilities>
  readonly unsupported: readonly (keyof AvatarCapabilities)[]
}
