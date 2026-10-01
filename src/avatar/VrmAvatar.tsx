import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import type { LoadedVrm } from './model'
import type { ArmPlacement, EyeDirection } from '../contracts/messages'
import { applyVrmFrame, calculateVrmFrame, type VrmFrame } from './framing'
import { VrmExpressionAdapter } from './expressionAdapter'
import { createVrmLoadController, loadVrm, updateVrm } from './vrmLoader'
import type { AnimationController } from './animationController'

export type VrmAvatarProps = {
  readonly url: string
  readonly controller: AnimationController
  readonly mouthOpen: number
  readonly armPlacement: ArmPlacement
  readonly eyeDirection: EyeDirection
  readonly frameCamera?: boolean
  readonly onLoaded?: (loaded: LoadedVrm) => void
  readonly onError?: (error: unknown) => void
}

/** Loads one VRM, frames it from landmarks, and advances its runtime systems. */
export function VrmAvatar({ url, controller, mouthOpen, armPlacement, eyeDirection, frameCamera = true, onLoaded, onError }: VrmAvatarProps) {
  const { camera } = useThree()
  const [loaded, setLoaded] = useState<LoadedVrm>()
  const [adapter, setAdapter] = useState<VrmExpressionAdapter>()
  const [frame, setFrame] = useState<VrmFrame>()
  const mouthRef = useRef(mouthOpen)
  mouthRef.current = mouthOpen

  useEffect(() => {
    const loadController = createVrmLoadController()
    let current: LoadedVrm | undefined
    void loadVrm(url, { signal: loadController.signal })
      .then((result) => {
        current = result
        setLoaded(result)
        setAdapter(new VrmExpressionAdapter(result.vrm))
        setFrame(calculateVrmFrame(result.vrm))
        onLoaded?.(result)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        onError?.(error)
      })
    return () => {
      loadController.cancel()
      current?.dispose()
      setLoaded(undefined)
      setAdapter(undefined)
      setFrame(undefined)
    }
  }, [onError, onLoaded, url])

  useEffect(() => {
    if (!frameCamera || !frame || !(camera instanceof PerspectiveCamera)) return
    applyVrmFrame(camera, frame)
  }, [camera, frame, frameCamera])

  useFrame((_, delta) => {
    if (!loaded || !adapter || !frame) return
    updateVrm(loaded, delta)
    adapter.setArmPlacement(armPlacement)
    adapter.apply(controller.update(delta), mouthRef.current, frame.target, eyeDirection, delta)
  })

  return loaded ? <primitive object={loaded.vrm.scene} /> : null
}
