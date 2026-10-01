import type { StateMessage } from '../contracts/messages'
import type { BaseState } from '../contracts/states'
import { INITIAL_ASSISTANT_STATE, type AssistantState } from './assistantState'
import { DEFAULT_TRANSIENT_DURATION_MS, emotionForState, gazeForState } from './transitionRules'

type Timer = ReturnType<typeof globalThis.setTimeout>
type StateMachineOptions = {
  readonly now?: () => number
  readonly schedule?: (callback: () => void, delayMs: number) => Timer
  readonly cancelSchedule?: (timer: Timer) => void
  readonly transientDurationsMs?: Partial<Record<'success' | 'error', number>>
}

/**
 * Owns base assistant state. Sequence numbers are the only ordering authority;
 * wall-clock timestamps are intentionally not consulted.
 */
export class AssistantStateMachine {
  private current: AssistantState = INITIAL_ASSISTANT_STATE
  private lastSeq = 0
  private generation = 0
  private expiryTimer: Timer | undefined
  private readonly listeners = new Set<(state: AssistantState) => void>()
  private readonly now: () => number
  private readonly schedule: (callback: () => void, delayMs: number) => Timer
  private readonly cancelSchedule: (timer: Timer) => void
  private readonly durations: Partial<Record<'success' | 'error', number>>

  public constructor(options: StateMachineOptions = {}) {
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? ((callback, delay) => globalThis.setTimeout(callback, delay))
    this.cancelSchedule = options.cancelSchedule ?? ((timer) => globalThis.clearTimeout(timer))
    this.durations = options.transientDurationsMs ?? {}
  }

  public get state(): AssistantState { return this.current }
  public get sequence(): number { return this.lastSeq }

  public subscribe(listener: (state: AssistantState) => void): () => void {
    this.listeners.add(listener)
    listener(this.current)
    return () => this.listeners.delete(listener)
  }

  /** Returns false for duplicate/stale events and leaves state untouched. */
  public dispatch(message: Pick<StateMessage, 'seq' | 'state' | 'durationMs'>): boolean {
    if (!Number.isSafeInteger(message.seq) || message.seq <= this.lastSeq) return false
    this.lastSeq = message.seq
    this.generation += 1
    const generation = this.generation
    this.clearExpiry()

    const state = message.state
    const transient = state === 'success' || state === 'error'
    const requestedDuration = message.durationMs
    const duration = state === 'success' || state === 'error'
      ? requestedDuration ?? this.durations[state] ?? DEFAULT_TRANSIENT_DURATION_MS[state]
      : 0
    const expiresAt = transient && duration > 0 ? this.now() + duration : null
    this.current = {
      state,
      seq: message.seq,
      expiresAt,
      emotion: emotionForState(state),
      gaze: gazeForState(state),
      speaking: this.current.speaking,
      idle: true,
    }
    this.emit()
    if (expiresAt !== null) {
      this.expiryTimer = this.schedule(() => {
        if (generation !== this.generation || this.current.expiresAt !== expiresAt) return
        this.expireTransient(generation)
      }, duration)
    }
    return true
  }

  /** Speaking is an overlay and does not consume a bridge sequence. */
  public setSpeaking(speaking: boolean): void {
    if (this.current.speaking === speaking) return
    this.current = { ...this.current, speaking }
    this.emit()
  }

  /** Cancels an outstanding transient timer without accepting an event. */
  public cancel(): void {
    this.generation += 1
    this.clearExpiry()
    if (this.current.expiresAt !== null) {
      this.current = { ...this.current, expiresAt: null }
      this.emit()
    }
  }

  private expireTransient(generation: number): void {
    if (generation !== this.generation || this.current.expiresAt === null) return
    this.expiryTimer = undefined
    this.current = {
      ...this.current,
      state: 'waiting',
      emotion: 'neutral',
      gaze: { kind: 'camera' },
      expiresAt: null,
    }
    this.emit()
  }

  private clearExpiry(): void {
    if (this.expiryTimer !== undefined) this.cancelSchedule(this.expiryTimer)
    this.expiryTimer = undefined
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current)
  }
}

export function createAssistantStateMachine(options?: StateMachineOptions): AssistantStateMachine {
  return new AssistantStateMachine(options)
}

export type { BaseState }
