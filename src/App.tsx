import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ArmPlacement, BridgeMessage, EyeDirection } from './contracts/messages'
import appPackage from '../package.json'
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
function describeBridgeCommand(message: BridgeMessage): string {
  switch (message.type) {
    case 'state': return `state ${message.state}`
    case 'arms': return `arms ${message.placement}`
    case 'dance': return `dance ${message.style}`
    case 'eyes': return `eyes ${message.direction}`
    case 'speech.start': return 'speech start'
    case 'speech.stop': return 'speech stop'
    case 'ping': return 'ping'
    case 'diagnostics': return `diagnostics ${message.level}`
  }
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
  const [lastCommand, setLastCommand] = useState('waiting')
  const [commandInput, setCommandInput] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [portraitMode, setPortraitMode] = useState(false)

  useEffect(() => {
    const closePopupOrWindow = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key !== 'escape' && !(event.metaKey && key === 'w')) return
      event.preventDefault()
      if (showHelp) setShowHelp(false)
      else void getCurrentWindow().close()
    }
    window.addEventListener('keydown', closePopupOrWindow)
    return () => window.removeEventListener('keydown', closePopupOrWindow)
  }, [showHelp])
  useEffect(() => {
    void invoke('set_click_through', { enabled: false })
  }, [])
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
    setLastCommand(describeBridgeCommand(message))
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
        if (message.code === 'portrait' && (message.message === 'on' || message.message === 'off')) {
          setPortraitMode(message.message === 'on')
        }
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

  const submitCommand = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const command = commandInput.trim()
    if (!command) return
    if (command.startsWith('!')) {
      const shellCommand = command.slice(1).trim()
      if (!shellCommand) {
        setError('Shell command cannot be empty')
        return
      }
      try {
        await invoke('run_shell_command', { command: shellCommand })
        setCommandInput('')
        setError(undefined)
      } catch (commandError) {
        setError(`Shell command: ${describeError(commandError)}`)
      }
      return
    }
    const [verb, ...rest] = command.split(/\s+/)
    const normalizedCommand = verb === 's'
      ? ['state', ...rest].join(' ')
      : verb === 'emo'
        ? ['emotion', ...rest].join(' ')
        : command
    if (normalizedCommand === 'help' || normalizedCommand === '?' || normalizedCommand === 'h') {
      setShowHelp(true)
      return
    }
    try {
      await invoke('run_avatar_command', { command: normalizedCommand })
      setCommandInput('')
    } catch (commandError) {
      setError(`Command: ${describeError(commandError)}`)
    }
  }, [commandInput])




  return (
    <main className={`avatar-shell${portraitMode ? ' portrait-mode' : ''}`}>
      <AvatarScene
        modelUrl={`${import.meta.env.BASE_URL}avatar.vrm`}
        controller={controller}
        mouthOpen={mouthOpen}
        armPlacement={armPlacement}
        eyeDirection={eyeDirection}
        portraitMode={portraitMode}
        onLoaded={onLoaded}
        onError={onModelError}
      />
      {showHelp ? (
        <aside className="help-popup" role="dialog" aria-label="Avatar commands">
          <button className="help-close" type="button" onClick={() => setShowHelp(false)}>×</button>
          <strong>Commands</strong>
          <code>s(tate) waiting|thinking|success|error</code>
          <code>emo(tion) neutral|thinking|happy|concerned</code>
          <code>arms normal|balance|stop</code>
          <code>eyes auto|center|left|right|up|down|discover</code>
          <code>dance swifty|stop</code>
          <code>ping</code>
          <code>portrait on|off  (show upper 55%)</code>
          <code>! &lt;unix command&gt;  (runs via /bin/sh)</code>
        </aside>
      ) : null}
      <form className="command-bar" onSubmit={submitCommand}>
        <input
          value={commandInput}
          onChange={(event) => setCommandInput(event.target.value)}
          aria-label="Avatar command"
        />
        <button type="submit">Send</button>
      </form>
      <section className="status-card" aria-live="polite">
        <strong>Omavatar</strong>
        <span className={`status-dot status-${status}`} />
        <span>{lastCommand}{assistantState.speaking ? ' · speaking' : ''}</span>
        <small>{appPackage.version} · {model ? (model.capabilities.unsupported.length ? 'partial capabilities' : 'full capabilities') : 'loading model…'}</small>
        {error ? <small className="error-text">{error}</small> : null}
      </section>
    </main>
  )
}
