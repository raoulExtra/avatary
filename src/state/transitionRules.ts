import type { BaseState, EmotionIntent, GazeIntent } from '../contracts/states'

export const DEFAULT_TRANSIENT_DURATION_MS: Readonly<Record<'success' | 'error', number>> = {
  success: 1400,
  error: 2200,
}

export function emotionForState(state: BaseState): EmotionIntent {
  switch (state) {
    case 'success': return 'happy'
    case 'error': return 'concerned'
    default: return 'neutral'
  }
}

export function gazeForState(state: BaseState): GazeIntent {
  return state === 'thinking' ? { kind: 'up', amount: 0.18 } : { kind: 'camera' }
}
