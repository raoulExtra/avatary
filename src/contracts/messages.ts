import type { BaseState } from './states'

export const PROTOCOL_VERSION = 1 as const
export type ProtocolVersion = typeof PROTOCOL_VERSION

/** Sequence values are positive safe integers and strictly increase per sender. */
export const SEQUENCE_MIN = 1
export const SEQUENCE_MAX = Number.MAX_SAFE_INTEGER
export const MAX_MESSAGE_BYTES = 16 * 1024
export const MAX_AUDIO_PATH_LENGTH = 512
export const MAX_SPEECH_ID_LENGTH = 128
export const MAX_DIAGNOSTIC_TEXT_LENGTH = 1024
export const MAX_STATE_DURATION_MS = 60_000

export type MessageBase = {
  readonly version: ProtocolVersion
  readonly seq: number
  /** Diagnostic only; receivers never use it for ordering. */
  readonly timestamp?: number
}

export type StateMessage = MessageBase & {
  readonly type: 'state'
  readonly state: BaseState
  readonly durationMs?: number
}

export type SpeechStartMessage = MessageBase & {
  readonly type: 'speech.start'
  /** POSIX-relative path below $XDG_RUNTIME_DIR/oma-avatar/audio/. */
  readonly audioPath: string
  readonly speechId?: string
}

export type SpeechStopMessage = MessageBase & {
  readonly type: 'speech.stop'
  readonly speechId?: string
}
export type ArmPlacement = 'balance' | 'normal' | 'stop'

export type ArmsMessage = MessageBase & {
  readonly type: 'arms'
  readonly placement: ArmPlacement
}
export type DanceStyle = 'swifty'

export type DanceMessage = MessageBase & {
  readonly type: 'dance'
  readonly style: DanceStyle | 'stop'
}

export type EyeDirection = 'auto' | 'center' | 'left' | 'right' | 'up' | 'down' | 'discover'

export type EyesMessage = MessageBase & {
  readonly type: 'eyes'
  readonly direction: EyeDirection
}

export type PingMessage = MessageBase & { readonly type: 'ping' }

export const DIAGNOSTIC_LEVELS = ['info', 'warning', 'error'] as const
export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number]

export type DiagnosticsMessage = MessageBase & {
  readonly type: 'diagnostics'
  readonly level: DiagnosticLevel
  readonly code: string
  readonly message: string
}

export type BridgeMessage =
  | StateMessage
  | SpeechStartMessage
  | SpeechStopMessage
  | ArmsMessage
  | DanceMessage
  | EyesMessage
  | PingMessage
  | DiagnosticsMessage
