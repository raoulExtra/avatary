import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import type { LoadedVrm } from './model'
import { detectCapabilities, detectVrmVersion } from './model'

export type VrmLoadOptions = {
  readonly signal?: AbortSignal
  readonly onProgress?: (loaded: number, total: number) => void
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('VRM loading was cancelled', 'AbortError')
}

function parsedVrm(gltf: GLTF): VRM {
  const vrm = (gltf.userData as { vrm?: VRM }).vrm
  if (!vrm) throw new Error('GLTF did not contain a VRM extension/model')
  return vrm
}

/**
 * Load one VRM with the official plugin. The returned dispose owns all GPU resources
 * created for that load and is safe to call more than once.
 */
export async function loadVrm(url: string, options: VrmLoadOptions = {}): Promise<LoadedVrm> {
  throwIfAborted(options.signal)
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltfPromise = loader.loadAsync(url, (event) => {
    options.onProgress?.(event.loaded, event.total)
  })
  let gltf: GLTF | undefined
  if (!options.signal) {
    gltf = await gltfPromise
  } else {
    gltfPromise.then((loaded) => {
      if (options.signal?.aborted) VRMUtils.deepDispose(loaded.scene)
    }, () => undefined)
    const cancellation = new Promise<never>((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('VRM loading was cancelled', 'AbortError')), { once: true })
    })
    gltf = await Promise.race([gltfPromise, cancellation])
  }
  try {
    throwIfAborted(options.signal)
    if (!gltf) throw new Error('VRM loader completed without a GLTF result')

    const vrm = parsedVrm(gltf)
    const version = detectVrmVersion(vrm)
    const capabilities = detectCapabilities(vrm, version)
    let disposed = false
    return {
      vrm,
      version,
      capabilities,
      dispose: () => {
        if (disposed) return
        disposed = true
        VRMUtils.deepDispose(vrm.scene)
      },
    }
  } catch (error) {
    if (gltf) VRMUtils.deepDispose(gltf.scene)
    throw error
  }
}

/** Advance VRM look-at, spring bones, and other plugin-owned per-frame systems. */
export function updateVrm(loaded: LoadedVrm, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return
  loaded.vrm.update(deltaSeconds)
}

/** Abort-aware ownership helper for callers that replace a model while loading. */
export function createVrmLoadController(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  return { signal: controller.signal, cancel: () => controller.abort() }
}
