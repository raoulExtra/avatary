import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WebGLRenderer } from 'three'
import type { LoadedVrm } from './avatar/model'
import { AnimationController } from './avatar/animationController'
import { ArAvatarScene } from './avatar/ArAvatarScene'
import './ar-styles.css'

type ArSupport = 'checking' | 'supported' | 'unsupported'
type ArSession = 'idle' | 'starting' | 'active' | 'ended'

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function ArApp() {
  const controller = useMemo(() => new AnimationController(), [])
  const [renderer, setRenderer] = useState<WebGLRenderer>()
  const [support, setSupport] = useState<ArSupport>('checking')
  const [session, setSession] = useState<ArSession>('idle')
  const [canPlace, setCanPlace] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [model, setModel] = useState<LoadedVrm>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    const xr = navigator.xr
    if (!xr) {
      setSupport('unsupported')
      return
    }
    void xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (!cancelled) setSupport(supported ? 'supported' : 'unsupported')
      })
      .catch((supportError: unknown) => {
        if (!cancelled) {
          setSupport('unsupported')
          setError(`AR support: ${describeError(supportError)}`)
        }
      })
    return () => { cancelled = true }
  }, [])

  const enterAr = useCallback(async () => {
    if (!renderer || !navigator.xr) return
    setError(undefined)
    setSession('starting')
    setPlaced(false)
    try {
      const xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      })
      xrSession.addEventListener('end', () => {
        setSession('ended')
        setCanPlace(false)
        setPlaced(false)
      }, { once: true })
      await renderer.xr.setSession(xrSession)
      setSession('active')
    } catch (sessionError: unknown) {
      setSession('idle')
      setError(`Could not start AR: ${describeError(sessionError)}`)
    }
  }, [renderer])

  const exitAr = useCallback(() => {
    const activeSession = renderer?.xr.getSession()
    if (activeSession) void activeSession.end()
  }, [renderer])

  const onLoaded = useCallback((loaded: LoadedVrm) => {
    setModel(loaded)
    setError(undefined)
  }, [])

  const onModelError = useCallback((loadError: unknown) => {
    setError(`Model: ${describeError(loadError)}`)
  }, [])

  return (
    <main className="ar-shell">
      <ArAvatarScene
        modelUrl={`${import.meta.env.BASE_URL}avatar.vrm`}
        controller={controller}
        locked={placed}
        onLoaded={onLoaded}
        onError={onModelError}
        onPlacementAvailable={setCanPlace}
        onRendererReady={setRenderer}
      />
      <section className="ar-card" aria-live="polite">
        <strong>Omavatar AR</strong>
        <span>{model ? (support === 'unsupported' ? '3D preview' : 'Avatar ready') : 'Loading avatar…'}</span>
        {support === 'checking' ? <small>Checking ARCore support…</small> : null}
        {support === 'unsupported' ? <small>AR placement needs Chrome on an ARCore-capable Android phone over HTTPS. The preview remains available here.</small> : null}
        {support === 'supported' && session !== 'active' ? (
          <button type="button" onClick={() => void enterAr()} disabled={session === 'starting' || !model}>
            {session === 'starting' ? 'Starting camera…' : 'View in my room'}
          </button>
        ) : null}
        {session === 'active' && !placed ? (
          <button type="button" onClick={() => setPlaced(true)} disabled={!canPlace}>
            {canPlace ? 'Place Omavatar here' : 'Move the phone to find a surface'}
          </button>
        ) : null}
        {session === 'active' && placed ? (
          <button type="button" onClick={() => setPlaced(false)}>Move Omavatar</button>
        ) : null}
        {session === 'active' ? <button className="secondary" type="button" onClick={exitAr}>Exit AR</button> : null}
        {error ? <small className="ar-error">{error}</small> : null}
      </section>
    </main>
  )
}
