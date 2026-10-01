export type IdleMotionOutput = {
  readonly blink: number
  readonly breathing: number
  readonly sway: number
}

export type IdleMotionOptions = {
  readonly random?: () => number
  readonly blinkMinSeconds?: number
  readonly blinkMaxSeconds?: number
  readonly blinkSeconds?: number
}

const DEFAULT_BLINK_MIN = 3.2
const DEFAULT_BLINK_MAX = 6.8
const DEFAULT_BLINK_LENGTH = 0.14

/** Frame-driven idle layer; all outputs are bounded and drift-free. */
export class IdleMotion {
  private readonly random: () => number
  private readonly blinkMin: number
  private readonly blinkMax: number
  private readonly blinkLength: number
  private elapsed = 0
  private nextBlink: number
  private blinkStartedAt: number | null = null

  public constructor(options: IdleMotionOptions = {}) {
    this.random = options.random ?? Math.random
    this.blinkMin = Math.max(0.1, options.blinkMinSeconds ?? DEFAULT_BLINK_MIN)
    this.blinkMax = Math.max(this.blinkMin, options.blinkMaxSeconds ?? DEFAULT_BLINK_MAX)
    this.blinkLength = Math.max(0.04, options.blinkSeconds ?? DEFAULT_BLINK_LENGTH)
    this.nextBlink = this.randomDelay()
  }

  public reset(): void {
    this.elapsed = 0
    this.blinkStartedAt = null
    this.nextBlink = this.randomDelay()
  }

  public update(deltaSeconds: number): IdleMotionOutput {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.25))
    this.elapsed += delta
    if (this.blinkStartedAt === null && this.elapsed >= this.nextBlink) {
      this.blinkStartedAt = this.elapsed
    }

    let blink = 0
    if (this.blinkStartedAt !== null) {
      const progress = (this.elapsed - this.blinkStartedAt) / this.blinkLength
      if (progress >= 1) {
        this.blinkStartedAt = null
        this.nextBlink = this.elapsed + this.randomDelay()
      } else {
        // Smooth 0→1→0 eyelid request, with no unbounded accumulated value.
        blink = Math.sin(Math.PI * Math.max(0, progress))
      }
    }
    return {
      blink,
      breathing: 0.5 + 0.5 * Math.sin(this.elapsed * 1.65),
      sway: 0.65 * Math.sin(this.elapsed * 0.42) + 0.35 * Math.sin(this.elapsed * 0.19 + 1.1),
    }
  }

  private randomDelay(): number {
    const sample = Math.max(0, Math.min(1, this.random()))
    return this.blinkMin + sample * (this.blinkMax - this.blinkMin)
  }
}

export function createIdleMotion(options?: IdleMotionOptions): IdleMotion {
  return new IdleMotion(options)
}
