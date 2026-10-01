import type { AnimationIntent, BaseState } from '../contracts/states'
import type { AssistantState } from '../state/assistantState'
import { IdleMotion, type IdleMotionOutput, type IdleMotionOptions } from './idleMotion'

export type AnimationControllerOutput = IdleMotionOutput & {
  readonly intent: AnimationIntent
  /** Bounded normalized head sway request. */
  readonly headSway: number
  /** Bounded normalized concern tilt request. */
  readonly headTilt: number
  /** Bounded normalized success smile request. */
  readonly smile: number
}

export type AnimationControllerOptions = IdleMotionOptions & {
  readonly idleMotion?: IdleMotion
}

const INTENT_BY_STATE: Record<BaseState, AnimationIntent> = {
  waiting: { emotion: 'neutral', gaze: { kind: 'camera' }, speaking: false, idle: true },
  thinking: { emotion: 'neutral', gaze: { kind: 'up', amount: 0.18 }, speaking: false, idle: true },
  success: { emotion: 'happy', gaze: { kind: 'camera' }, speaking: false, idle: true },
  error: { emotion: 'concerned', gaze: { kind: 'camera' }, speaking: false, idle: true },
}

/** Composes state intent and bounded procedural motion without model-specific names. */
export class AnimationController {
  private readonly idle: IdleMotion
  private intent: AnimationIntent = INTENT_BY_STATE.waiting
  private state: BaseState = 'waiting'

  public constructor(options: AnimationControllerOptions = {}) {
    this.idle = options.idleMotion ?? new IdleMotion(options)
  }

  public setState(state: BaseState): void {
    this.state = state
    this.intent = { ...INTENT_BY_STATE[state], speaking: this.intent.speaking }
  }

  public setIntent(intent: AnimationIntent): void {
    this.intent = { ...intent }
    this.state = intent.emotion === 'happy' ? 'success' : intent.emotion === 'concerned' ? 'error' : intent.gaze.kind === 'up' ? 'thinking' : 'waiting'
  }

  public applyAssistantState(state: AssistantState): void {
    this.state = state.state
    this.intent = {
      emotion: state.emotion,
      gaze: state.gaze,
      speaking: state.speaking,
      idle: state.idle,
    }
  }

  public setSpeaking(speaking: boolean): void {
    this.intent = { ...this.intent, speaking }
  }

  public update(deltaSeconds: number): AnimationControllerOutput {
    const idle = this.idle.update(deltaSeconds)
    const thinking = this.state === 'thinking'
    const success = this.state === 'success'
    const error = this.state === 'error'
    return {
      ...idle,
      intent: this.intent,
      // Sway remains bounded and is reduced while thinking for a steadier gaze.
      headSway: idle.sway * (thinking ? 0.65 : 1),
      headTilt: error ? 0.18 : 0,
      // Keep the success expression as a subtle smile rather than a full grin.
      smile: success ? 0.35 : 0,
    }
  }
}

export function createAnimationController(options?: AnimationControllerOptions): AnimationController {
  return new AnimationController(options)
}
