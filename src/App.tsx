import { useCallback, useEffect, useMemo, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { ArmPlacement, BridgeMessage, EyeDirection } from './contracts/messages'
import type { LoadedVrm } from './avatar/model'
import { AnimationController } from './avatar/animationController'
import { AvatarScene } from './avatar/AvatarScene'
import { AudioPlaybackController } from './audio/playback'
import { createAssistantStateMachine } from './state/stateMachine'
import './styles.css'

type ConnectionStatus = 'starting' | 'connected' | 'disconnected'

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Connects the local bridge to the state/audio owners and renders the avatar surface. */
export function App() {
  const machine = useMemo(() => createAssistantStateMachine(), [])
  const controller = useMemo(() => new AnimationController(), [])
  const [assistantState, setAssistantState] = useState(machine.state)
  const [mouthOpen, setMouthOpen] = useState(0)
  const [status, setStatus] = useState<ConnectionStatus>('starting')
  const [armPlacement, setArmPlacement] = useState<ArmPlacement>('normal')
  const [eyeDirection, setEyeDirection] = useState<EyeDirection>('auto')
  const [model, setModel] = useState<LoadedVrm>()
  const [error, setError] = useState<string>()

  useEffect(() => machine.subscribe((next) => {
    controller.applyAssistantState(next)
    setAssistantState(next)
  }), [controller, machine])

  const audio = useMemo(() => new AudioPlaybackController({
    onSpeakingChange: (speaking) => machine.setSpeaking(speaking),
    onMouthOpen: setMouthOpen,
    onError: (audioError) => setError(`Audio: ${describeError(audioError)}`),
  }), [machine])

  const handleBridgeMessage = useCallback((message: BridgeMessage) => {
    setError(undefined)
    switch (message.type) {
      case 'state':
        machine.dispatch(message)
        break
      case 'arms':
        setArmPlacement(message.placement)
        break
      case 'dance':
        if (message.style === 'stop') controller.stopDance()
        else controller.setDance(message.style)
        break
      case 'eyes':
        setEyeDirection(message.direction)
        break
      case 'speech.start':
        void (async () => {
          try {
            const absolutePath = await invoke<string>('resolve_audio_path', { relative: message.audioPath })
            const started = await audio.start(convertFileSrc(absolutePath), message.speechId)
            if (!started) machine.setSpeaking(false)
          } catch (audioError) {
            machine.setSpeaking(false)
            setError(`Audio: ${describeError(audioError)}`)
          }
        })()
        break
      case 'speech.stop':
        audio.stop(message.speechId)
        break
      case 'diagnostics':
        if (message.level === 'error') setError(`${message.code}: ${message.message}`)
        break
      case 'ping':
        break
    }
  }, [audio, machine])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const messages = await invoke<BridgeMessage[]>('drain_bridge_messages')
        if (!cancelled) {
          setStatus('connected')
          messages.forEach(handleBridgeMessage)
        }
      } catch (bridgeError) {
        if (!cancelled) {
          setStatus('disconnected')
          setError(`Bridge: ${describeError(bridgeError)}`)
        }
      }
      if (!cancelled) timer = globalThis.setTimeout(() => void poll(), 100)
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) globalThis.clearTimeout(timer)
      audio.dispose()
    }
  }, [audio, handleBridgeMessage])

  const onLoaded = useCallback((loaded: LoadedVrm) => {
    setModel(loaded)
    setError(undefined)
  }, [])
  const onModelError = useCallback((loadError: unknown) => {
    setError(`Model: ${describeError(loadError)}`)
  }, [])

  return (
    <main className="avatar-shell">
      <AvatarScene
        modelUrl={`${import.meta.env.BASE_URL}avatar.vrm`}
        controller={controller}
        mouthOpen={mouthOpen}
        armPlacement={armPlacement}
        eyeDirection={eyeDirection}
        onLoaded={onLoaded}
        onError={onModelError}
      />
      <section className="status-card" aria-live="polite">
        <strong>Omavatar</strong>
        <span className={`status-dot status-${status}`} />
        <span>{assistantState.state}{assistantState.speaking ? ' · speaking' : ''}</span>
        <small>{model ? `${model.version} · ${model.capabilities.unsupported.length ? 'partial capabilities' : 'full capabilities'}` : 'loading model…'}</small>
        {error ? <small className="error-text">{error}</small> : null}
      </section>
    </main>
  )
}
