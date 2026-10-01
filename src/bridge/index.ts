import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { BridgeMessage } from '../contracts/messages'

export const BRIDGE_EVENT = 'oma-avatar://bridge-message'
export type BridgeListener = (message: BridgeMessage) => void

function parseMessagePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function parseMessage(value: unknown): BridgeMessage | undefined {
  const parsed = parseMessagePayload(value)
  if (!parsed || typeof parsed !== 'object') return undefined
  const message = parsed as Record<string, unknown>
  if (message.version !== 1 || typeof message.seq !== 'number' || !Number.isSafeInteger(message.seq) || message.seq <= 0 || typeof message.type !== 'string') return undefined
  return parsed as BridgeMessage
}

/** Subscribe to messages emitted by the validated Rust bridge. */
export async function subscribeBridge(listener: BridgeListener, onDisconnect?: () => void): Promise<UnlistenFn> {
  let previous = 0
  return listen<unknown>(BRIDGE_EVENT, (event) => {
    const message = parseMessage(event.payload)
    if (!message || message.seq <= previous) return
    previous = message.seq
    listener(message)
  }).catch((error) => {
    onDisconnect?.()
    throw error
  })
}

export type BridgeConnection = { close: () => void }

/** Adapter useful for app code that needs an explicit connection lifecycle. */
export async function connectBridge(listener: BridgeListener, onDisconnect?: () => void): Promise<BridgeConnection> {
  const unlisten = await subscribeBridge(listener, onDisconnect)
  return { close: unlisten }
}
