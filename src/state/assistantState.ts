/** UI-facing state snapshot produced by the assistant state machine. */
import type { AnimationIntent, BaseState } from '../contracts/states'

export type AssistantState = AnimationIntent & {
  readonly state: BaseState
  readonly seq: number
  readonly expiresAt: number | null
}

export const INITIAL_ASSISTANT_STATE: AssistantState = {
  state: 'waiting',
  seq: 0,
  expiresAt: null,
  emotion: 'neutral',
  gaze: { kind: 'camera' },
  speaking: false,
  idle: true,
}
