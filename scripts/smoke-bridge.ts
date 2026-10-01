#!/usr/bin/env node
/**
 * Mock sender for the local bridge. Run with a TS runner while the avatar is open:
 *   XDG_RUNTIME_DIR=/run/user/$UID tsx scripts/smoke-bridge.ts
 */
import net from 'node:net'
import path from 'node:path'

const runtime = process.env.XDG_RUNTIME_DIR
if (!runtime || !path.isAbsolute(runtime)) throw new Error('XDG_RUNTIME_DIR must be an absolute path')
const socketPath = path.join(runtime, 'oma-avatar', 'bridge.sock')
const messages = [
  { version: 1, seq: 1, type: 'state', state: 'thinking' },
  { version: 1, seq: 2, type: 'state', state: 'success', durationMs: 1200 },
  { version: 1, seq: 3, type: 'speech.start', audioPath: 'smoke.wav', speechId: 'smoke' },
  { version: 1, seq: 4, type: 'speech.stop', speechId: 'smoke' },
  { version: 1, seq: 5, type: 'ping' },
]
const socket = net.createConnection(socketPath)
socket.setTimeout(2000)
socket.once('connect', () => {
  socket.end(messages.map((message) => `${JSON.stringify(message)}\n`).join(''), () => console.log(`sent ${messages.length} validated bridge messages`))
})
socket.once('timeout', () => { socket.destroy(new Error('bridge connection timed out')) })
socket.once('error', (error) => { console.error(`bridge smoke failed: ${error.message}`); process.exitCode = 1 })
