/** Canonical base state owned by the bridge. Speaking is a separate overlay. */
export const BASE_STATES = ['waiting', 'thinking', 'success', 'error'] as const
export type BaseState = (typeof BASE_STATES)[number]

export const EMOTION_INTENTS = ['neutral', 'happy', 'concerned'] as const
export type EmotionIntent = (typeof EMOTION_INTENTS)[number]

export type GazeIntent =
  | { readonly kind: 'camera' }
  | { readonly kind: 'up'; readonly amount: number }

export type AnimationIntent = {
  readonly emotion: EmotionIntent
  readonly gaze: GazeIntent
  readonly speaking: boolean
  readonly idle: boolean
}

export const EMOTION_TO_STATE: Readonly<Record<EmotionIntent, BaseState>> = {
  neutral: 'waiting',
  happy: 'success',
  concerned: 'error',
}
