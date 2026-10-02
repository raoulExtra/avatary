import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { VrmAvatar } from './VrmAvatar'
import type { ArmPlacement, EyeDirection } from '../contracts/messages'
import type { LoadedVrm } from './model'
import type { AnimationController } from './animationController'

export type AvatarSceneProps = {
  readonly modelUrl: string
  readonly controller: AnimationController
  readonly mouthOpen: number
  readonly armPlacement: ArmPlacement
  readonly eyeDirection: EyeDirection
  readonly portraitMode: boolean
  readonly onLoaded: (loaded: LoadedVrm) => void
  readonly onError: (error: unknown) => void
}

/** The host window remains transparent; lights only affect the VRM content. */
export function AvatarScene({ modelUrl, controller, mouthOpen, armPlacement, eyeDirection, portraitMode, onLoaded, onError }: AvatarSceneProps) {
  return (
    <Canvas
      camera={{ fov: 28, near: 0.01, far: 20, position: portraitMode ? [0, 1, 2.6] : [0, 1, 3.6] }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 3, 4]} intensity={2.2} />
      <directionalLight position={[-2, 1, 2]} intensity={0.7} color="#9ecbff" />
      <Suspense fallback={null}>
        <VrmAvatar
          url={modelUrl}
          controller={controller}
          mouthOpen={mouthOpen}
          armPlacement={armPlacement}
          onLoaded={onLoaded}
          eyeDirection={eyeDirection}
          onError={onError}
        />
      </Suspense>
    </Canvas>
  )
}
