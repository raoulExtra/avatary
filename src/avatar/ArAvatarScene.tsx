import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Group, Matrix4, Quaternion, Vector3, type WebGLRenderer } from 'three'
import { VrmAvatar } from './VrmAvatar'
import type { LoadedVrm } from './model'
import type { AnimationController } from './animationController'
import type { ArmPlacement, EyeDirection } from '../contracts/messages'

type ArPlacementProps = {
  readonly modelUrl: string
  readonly controller: AnimationController
  readonly locked: boolean
  readonly onLoaded: (loaded: LoadedVrm) => void
  readonly onError: (error: unknown) => void
  readonly onPlacementAvailable: (available: boolean) => void
}

export type ArAvatarSceneProps = Omit<ArPlacementProps, 'locked'> & {
  readonly locked: boolean
  readonly onRendererReady: (renderer: WebGLRenderer) => void
}

function ArPlacement({ modelUrl, controller, locked, onLoaded, onError, onPlacementAvailable }: ArPlacementProps) {
  const { gl } = useThree()
  const groupRef = useRef<Group>(null)
  const hitTestSourceRef = useRef<XRHitTestSource>()
  const referenceSpaceRef = useRef<XRReferenceSpace>()
  const lockedRef = useRef(locked)
  const availableRef = useRef(false)
  const poseMatrix = useRef(new Matrix4())
  const position = useRef(new Vector3())
  const quaternion = useRef(new Quaternion())
  const scale = useRef(new Vector3())

  lockedRef.current = locked

  useEffect(() => {
    gl.xr.enabled = true
    let disposed = false
    let activeSession: XRSession | undefined

    const clearHitTest = () => {
      hitTestSourceRef.current?.cancel()
      hitTestSourceRef.current = undefined
      referenceSpaceRef.current = undefined
      activeSession = undefined
      availableRef.current = false
      onPlacementAvailable(false)
      if (groupRef.current && !lockedRef.current) groupRef.current.visible = false
    }

    const prepareHitTest = async () => {
      const session = gl.xr.getSession()
      if (!session) return
      activeSession = session
      try {
        if (!session.requestHitTestSource) throw new Error('WebXR hit-test is unavailable')
        const viewerSpace = await session.requestReferenceSpace('viewer')
        const hitTestSource = await session.requestHitTestSource({ space: viewerSpace })
        if (!hitTestSource) throw new Error('WebXR hit-test source could not be created')
        const referenceSpace = await session.requestReferenceSpace('local')
        if (disposed || gl.xr.getSession() !== session) {
          hitTestSource.cancel()
          return
        }
        hitTestSourceRef.current = hitTestSource
        referenceSpaceRef.current = referenceSpace
      } catch (error) {
        if (!disposed) onError(error)
      }
    }

    const onSessionStart = () => void prepareHitTest()
    const onSessionEnd = () => clearHitTest()
    gl.xr.addEventListener('sessionstart', onSessionStart)
    gl.xr.addEventListener('sessionend', onSessionEnd)
    if (gl.xr.isPresenting) void prepareHitTest()

    return () => {
      disposed = true
      if (activeSession) activeSession.removeEventListener('end', onSessionEnd)
      gl.xr.removeEventListener('sessionstart', onSessionStart)
      gl.xr.removeEventListener('sessionend', onSessionEnd)
      clearHitTest()
    }
  }, [gl, onError, onPlacementAvailable])

  useFrame((_, _delta, frame) => {
    const group = groupRef.current
    const hitTestSource = hitTestSourceRef.current
    const referenceSpace = referenceSpaceRef.current
    if (!group || !frame || !hitTestSource || !referenceSpace || lockedRef.current) return

    const hit = frame.getHitTestResults(hitTestSource)[0]
    const pose = hit?.getPose(referenceSpace)
    if (!pose) {
      if (group.visible) group.visible = false
      if (availableRef.current) {
        availableRef.current = false
        onPlacementAvailable(false)
      }
      return
    }

    poseMatrix.current.fromArray(pose.transform.matrix)
    poseMatrix.current.decompose(position.current, quaternion.current, scale.current)
    group.position.copy(position.current)
    group.quaternion.copy(quaternion.current)
    group.scale.setScalar(0.75)
    group.updateMatrix()
    group.visible = true
    if (!availableRef.current) {
      availableRef.current = true
      onPlacementAvailable(true)
    }
  })

  return (
    <group ref={groupRef} visible={false} matrixAutoUpdate={false}>
      <VrmAvatar
        url={modelUrl}
        controller={controller}
        mouthOpen={0}
        armPlacement={'normal' satisfies ArmPlacement}
        eyeDirection={'auto' satisfies EyeDirection}
        frameCamera={false}
        onLoaded={onLoaded}
        onError={onError}
      />
    </group>
  )
}

export function ArAvatarScene({ modelUrl, controller, locked, onLoaded, onError, onPlacementAvailable, onRendererReady }: ArAvatarSceneProps) {
  return (
    <Canvas
      camera={{ fov: 60, near: 0.01, far: 100, position: [0, 1.2, 3] }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      onCreated={({ gl }) => {
        gl.xr.enabled = true
        gl.setClearAlpha(0)
        onRendererReady(gl)
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 3, 4]} intensity={2.2} />
      <directionalLight position={[-2, 1, 2]} intensity={0.7} color="#9ecbff" />
      <ArPlacement
        modelUrl={modelUrl}
        controller={controller}
        locked={locked}
        onLoaded={onLoaded}
        onError={onError}
        onPlacementAvailable={onPlacementAvailable}
      />
    </Canvas>
  )
}
