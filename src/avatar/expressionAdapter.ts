import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { AnimationControllerOutput, DanceMotionOutput } from './animationController'
import type { ArmPlacement, EyeDirection } from '../contracts/messages'

type ExpressionManager = {
  getExpression: (name: string) => unknown
  setValue: (name: string, weight: number) => void
}

type ExpressionNames = {
  readonly blink?: string
  readonly mouth?: string
  readonly happy?: string
  readonly concerned?: string
}

type StoredArmPose = {
  readonly name: string
  readonly node: Object3D
  readonly position: Vector3
  readonly quaternion: Quaternion
  readonly normalQuaternion: Quaternion
  readonly stopQuaternion: Quaternion
}

type StoredDanceBone = {
  readonly name: DanceBoneName
  readonly node: Object3D
  readonly quaternion: Quaternion
}

const DANCE_BONES = [
  'hips', 'spine', 'chest', 'upperChest',
  'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg',
] as const
type DanceBoneName = (typeof DANCE_BONES)[number]
const ARM_BONES = ['leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'] as const
function isArmDanceBone(name: DanceBoneName): boolean {
  return name.endsWith('Arm') || name.endsWith('Hand')
}

const BLINK_NAMES = ['blink', 'Blink']
const MOUTH_NAMES = ['aa', 'A', 'mouthA', 'MouthA', 'a']
const HAPPY_NAMES = ['happy', 'joy', 'fun', 'Joy', 'Happy']
const CONCERNED_NAMES = ['sad', 'sorrow', 'Sorrow', 'Sad']
const BASE_MOUTH_OPEN = 0.42

const EYE_OFFSETS: Record<Exclude<EyeDirection, 'auto' | 'discover'>, readonly [number, number]> = {
  center: [0, 0],
  left: [-0.28, 0],
  right: [0.28, 0],
  up: [0, 0.2],
  down: [0, -0.2],
}
function firstExpression(manager: ExpressionManager | undefined, names: readonly string[]): string | undefined {
  return names.find((name) => Boolean(manager?.getExpression(name)))
}

function rotateBoneToward(node: Object3D, child: Object3D, worldDirection: Vector3): void {
  const parentQuaternion = new Quaternion()
  node.parent?.getWorldQuaternion(parentQuaternion)
  const currentDirection = child.position.clone().applyQuaternion(node.quaternion).normalize()
  const targetDirection = worldDirection.clone().applyQuaternion(parentQuaternion.invert()).normalize()
  node.quaternion.premultiply(new Quaternion().setFromUnitVectors(currentDirection, targetDirection))
}
/** Applies semantic animation intents to whichever expression names a VRM exposes. */
export class VrmExpressionAdapter {
  private readonly manager?: ExpressionManager
  private readonly names: ExpressionNames
  private readonly head?: Object3D
  private readonly baseHeadRotation = new Quaternion()
  private readonly headOffset = new Quaternion()
  private readonly headEuler = new Euler()
  private readonly lookTarget = new Vector3()
  private readonly armsForBalance: readonly StoredArmPose[]
  private readonly danceBones: readonly StoredDanceBone[]
  private readonly danceEuler = new Euler()
  private readonly danceOffset = new Quaternion()
  private discoverTime = 0
  private armPlacement: ArmPlacement = 'normal'

  public constructor(private readonly vrm: VRM) {
    this.manager = vrm.expressionManager as ExpressionManager | undefined
    this.names = {
      blink: firstExpression(this.manager, BLINK_NAMES),
      mouth: firstExpression(this.manager, MOUTH_NAMES),
      happy: firstExpression(this.manager, HAPPY_NAMES),
      concerned: firstExpression(this.manager, CONCERNED_NAMES),
    }
    this.head = vrm.humanoid?.getNormalizedBoneNode('head') ?? undefined
    const armNodes: Record<string, Object3D> = Object.fromEntries(
      ARM_BONES.flatMap((bone) => {
        const node = vrm.humanoid?.getNormalizedBoneNode(bone)
        return node ? [[bone, node]] : []
      }),
    )
    const originalQuaternions: Record<string, Quaternion> = Object.fromEntries(
      ARM_BONES.filter((bone) => armNodes[bone]).map((bone) => [bone, armNodes[bone].quaternion.clone()]),
    )
    const normalQuaternions: Record<string, Quaternion> = {}
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1
      const upper = armNodes[`${side}UpperArm`]
      const lower = armNodes[`${side}LowerArm`]
      const hand = armNodes[`${side}Hand`]
      if (upper && lower && hand) {
        rotateBoneToward(upper, lower, new Vector3(sign * 0.25, -1, 0))
        vrm.scene.updateMatrixWorld(true)
        rotateBoneToward(lower, hand, new Vector3(sign * 0.05, -1, 0))
        vrm.scene.updateMatrixWorld(true)
      }
      if (upper) normalQuaternions[`${side}UpperArm`] = upper.quaternion.clone()
      if (lower) normalQuaternions[`${side}LowerArm`] = lower.quaternion.clone()
    }
    for (const bone of ARM_BONES) {
      const node = armNodes[bone]
      if (node) node.quaternion.copy(originalQuaternions[bone])
    }
    const stopQuaternions: Record<string, Quaternion> = {}
    for (const side of ['left', 'right'] as const) {
      const sign = side === 'left' ? 1 : -1
      const upper = armNodes[`${side}UpperArm`]
      const lower = armNodes[`${side}LowerArm`]
      if (upper && lower) {
        rotateBoneToward(upper, lower, new Vector3(sign * 0.65, -0.75, 0))
        vrm.scene.updateMatrixWorld(true)
        const hand = armNodes[`${side}Hand`]
        if (hand) rotateBoneToward(lower, hand, new Vector3(sign * 0.15, 1, 0))
        vrm.scene.updateMatrixWorld(true)
      }
      for (const bone of [`${side}UpperArm`, `${side}LowerArm`, `${side}Hand`]) {
        const node = armNodes[bone]
        if (node) stopQuaternions[bone] = node.quaternion.clone()
      }
    }
    for (const bone of ARM_BONES) {
      const node = armNodes[bone]
      if (node) node.quaternion.copy(originalQuaternions[bone])
    }
    this.armsForBalance = ARM_BONES.flatMap((bone) => {
      const node = armNodes[bone]
      return node
        ? [{ name: bone, node, position: node.position.clone(), quaternion: node.quaternion.clone(), normalQuaternion: normalQuaternions[bone] ?? node.quaternion.clone(), stopQuaternion: stopQuaternions[bone] ?? node.quaternion.clone() }]
        : []
    })
    this.danceBones = DANCE_BONES.flatMap((name) => {
      const node = vrm.humanoid?.getNormalizedBoneNode(name)
      return node ? [{ name, node, quaternion: node.quaternion.clone() }] : []
    })


  }
  public setArmPlacement(placement: ArmPlacement): void {
    this.armPlacement = placement
  }

  public apply(output: AnimationControllerOutput, mouthOpen: number, target: Vector3, eyeDirection: EyeDirection, deltaSeconds: number): void {
    const manager = this.manager
    if (manager) {
      this.set(manager, this.names.blink, output.blink)
      this.set(manager, this.names.mouth, Math.max(BASE_MOUTH_OPEN, mouthOpen))
      this.set(manager, this.names.happy, output.smile)
      this.set(manager, this.names.concerned, output.intent.emotion === 'concerned' ? 0.8 : 0)
    }

    for (const arm of this.armsForBalance) {
      arm.node.position.copy(arm.position)
      const quaternion = this.armPlacement === 'normal'
        ? arm.normalQuaternion
        : this.armPlacement === 'stop' ? arm.stopQuaternion : arm.quaternion
      arm.node.quaternion.copy(quaternion)
    }
    this.applyDance(output.dance)


    if (this.vrm.lookAt) {
      this.lookTarget.copy(target)
      if (eyeDirection === 'auto') {
        if (output.intent.gaze.kind === 'up') this.lookTarget.y += output.intent.gaze.amount
      } else if (eyeDirection === 'discover') {
        this.discoverTime += Math.min(Math.max(deltaSeconds, 0), 0.1)
        this.lookTarget.x += Math.sin(this.discoverTime * 0.55) * 0.45 + Math.sin(this.discoverTime * 0.23) * 0.14
        this.lookTarget.y += Math.sin(this.discoverTime * 0.37 + 1.1) * 0.18 + Math.sin(this.discoverTime * 0.71) * 0.05
      } else {
        const [x, y] = EYE_OFFSETS[eyeDirection]
        this.lookTarget.x += x
        this.lookTarget.y += y
      }
      this.vrm.lookAt.lookAt(this.lookTarget)
    }

    if (this.head) {
      this.headEuler.set(-output.headTilt * 0.45, output.headSway * 0.025, output.headSway * 0.035)
      this.headOffset.setFromEuler(this.headEuler)
      this.head.quaternion.copy(this.baseHeadRotation).multiply(this.headOffset)
    }
  }

  private applyDance(dance: DanceMotionOutput): void {
    if (dance.style !== 'swifty') {
      for (const bone of this.danceBones) {
        if (isArmDanceBone(bone.name)) continue
        bone.node.quaternion.copy(bone.quaternion)
      }
      return
    }
    for (const bone of this.danceBones) {
      if (!isArmDanceBone(bone.name)) bone.node.quaternion.copy(bone.quaternion)
    }

    const beat = dance.elapsedSeconds * Math.PI * 2.4
    const step = Math.sin(beat)
    const bounce = 0.5 - 0.5 * Math.cos(beat)
    const leftLift = Math.max(0, step)
    const rightLift = Math.max(0, -step)
    const leftArm = 0.12 + 0.6 * leftLift
    const rightArm = 0.12 + 0.6 * rightLift
    this.setDanceBone('hips', 0.035 * bounce, 0.1 * step, 0.07 * step)
    this.setDanceBone('spine', 0.035 * Math.sin(beat + 0.5), 0.06 * step, 0)
    this.setDanceBone('chest', 0.05 * Math.sin(beat + 0.8), 0.08 * step, 0)
    this.setDanceBone('upperChest', 0.03 * Math.sin(beat + 1.2), 0.05 * step, 0)
    this.setDanceArm('leftUpperArm', leftArm)
    this.setDanceArm('leftLowerArm', 0.08 + 0.5 * leftLift)
    this.setDanceArm('leftHand', 0.08 + 0.45 * leftLift)
    this.setDanceArm('rightUpperArm', rightArm)
    this.setDanceArm('rightLowerArm', 0.08 + 0.5 * rightLift)
    this.setDanceArm('rightHand', 0.08 + 0.45 * rightLift)
    this.setDanceBone('leftUpperLeg', 0.07 * rightLift, 0, 0.025 * step)
    this.setDanceBone('leftLowerLeg', -0.04 * rightLift, 0, 0)
    this.setDanceBone('rightUpperLeg', 0.07 * leftLift, 0, -0.025 * step)
    this.setDanceBone('rightLowerLeg', -0.04 * leftLift, 0, 0)
  }

  private setDanceArm(name: string, weight: number): void {
    const pose = this.armsForBalance.find((candidate) => candidate.name === name)
    if (!pose) return
    pose.node.quaternion.copy(pose.normalQuaternion).slerp(pose.stopQuaternion, Math.max(0, Math.min(1, weight)))
  }

  private setDanceBone(name: DanceBoneName, x: number, y: number, z: number): void {
    const bone = this.danceBones.find((candidate) => candidate.name === name)
    if (!bone) return
    this.danceEuler.set(x, y, z)
    this.danceOffset.setFromEuler(this.danceEuler)
    bone.node.quaternion.copy(bone.quaternion).multiply(this.danceOffset)
  }

  private set(manager: ExpressionManager, name: string | undefined, value: number): void {
    if (name) manager.setValue(name, Math.max(0, Math.min(1, value)))
  }
}
